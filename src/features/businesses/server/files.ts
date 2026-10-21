import { Types, type ClientSession } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { fallbackAttachmentName, formatAttachmentSize, safeAttachmentName } from "@/lib/attachments"
import { copyFile, getFileObject, getUploadUrl, headFile, storageErrorInfo } from "@/lib/storage/s3"
import { parseInput } from "@/features/access/server/commands"
import type { AccessContext } from "@/features/access/server/context"
import { loadPlatformState } from "@/features/platform/server/state"
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPE_MIME } from "@/features/platform/constants"
import { BUSINESS_FILE_PENDING_TTL_MS, BUSINESS_FILE_UPLOAD_URL_TTL_SECONDS, BUSINESS_LOGO_MIMES, type BusinessFilePurpose } from "../constants"
import { reserveBusinessFileSchema } from "../space-schemas"
import type { BusinessFileDto, BusinessFileReservationDto } from "../types"
import { businessTransaction } from "./access"
import { loadOwnedForWrite, loadVisibleBusiness, removeObjectsQuietly } from "./businesses"
import { businessModels, type BusinessFileRecord, type BusinessFileRef } from "./models"

/**
 * Arquivos do espaço do negócio (M2): documentos, anexos de sucessos e a logo. Mesmo fluxo dos
 * arquivos do Agente Opex: reserva com PUT assinado direto no Storage S3, confirmação (HeadObject e
 * tamanho) e vínculo ao item. Limites de Integrações › Plataforma (tamanho máximo e tipos
 * permitidos; a logo aceita só PNG/JPEG/WebP/GIF). Pendentes somem em 24 h (`businesses-purge`).
 */

export type BusinessFileDoc = BusinessFileRecord & { _id: Types.ObjectId }

const notFound = () => new DomainError(404, "Arquivo não encontrado", "BUSINESS_FILE_NOT_FOUND")
export const businessFilePath = (businessId: string, fileId: string) => `/api/businesses/${businessId}/files/${fileId}`
export const refOfFile = (doc: Pick<BusinessFileDoc, "_id" | "name" | "mediaType" | "size">): BusinessFileRef => ({ id: doc._id.toString(), name: doc.name, mediaType: doc.mediaType, size: doc.size })
export const toBusinessFileDto = (businessId: string, ref: BusinessFileRef): BusinessFileDto => ({ ...ref, url: businessFilePath(businessId, ref.id) })

const EXTENSION_MIME: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    odt: "application/vnd.oasis.opendocument.text",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    odp: "application/vnd.oasis.opendocument.presentation",
    txt: "text/plain",
    csv: "text/csv",
    md: "text/markdown",
}

/** Tipo do arquivo: o informado pelo navegador ou, se vazio/genérico, pela extensão. */
export function mediaTypeOf(name: string, informed?: string | null): string {
    const value = (informed ?? "").trim().toLowerCase().split(";")[0]!
    if (value && value !== "application/octet-stream") return value
    const extension = name.split(".").pop()?.toLowerCase() ?? ""
    return EXTENSION_MIME[extension] ?? (value || "application/octet-stream")
}

export interface BusinessFileLimits {
    maxBytes: number
    allowed: readonly string[]
    allowedLabel: string
}

/** Limites da Plataforma para a finalidade (a logo aceita só imagens rasterizadas). */
export async function businessFileLimits(purpose: BusinessFilePurpose): Promise<BusinessFileLimits> {
    const { documents } = (await loadPlatformState()).settings
    const maxBytes = documents.maxFileSizeMb * 1024 * 1024
    if (purpose === "logo") return { maxBytes, allowed: BUSINESS_LOGO_MIMES, allowedLabel: "PNG, JPEG, WebP ou GIF" }
    return { maxBytes, allowed: documents.allowedTypes.flatMap((type) => DOCUMENT_TYPE_MIME[type]), allowedLabel: documents.allowedTypes.map((type) => DOCUMENT_TYPE_LABELS[type].label).join(", ") }
}

export function assertFileAllowed(limits: BusinessFileLimits, mediaType: string, size: number, name: string): void {
    if (!limits.allowed.includes(mediaType)) throw new DomainError(400, `"${name}": tipo de arquivo não permitido (${mediaType}). Tipos aceitos: ${limits.allowedLabel}.`, "BUSINESS_FILE_TYPE")
    if (size > limits.maxBytes) throw new DomainError(413, `"${name}" tem ${formatAttachmentSize(size)}: o limite é ${formatAttachmentSize(limits.maxBytes)}.`, "BUSINESS_FILE_TOO_LARGE")
}

/** Reserva: confere dono, negócio ativo, tipo e tamanho; devolve o PUT assinado. */
export async function reserveBusinessFile(access: AccessContext, businessId: string, raw: unknown): Promise<BusinessFileReservationDto> {
    const input = parseInput(reserveBusinessFileSchema, raw)
    const name = safeAttachmentName(input.name.trim() || fallbackAttachmentName(input.mediaType))
    const mediaType = mediaTypeOf(name, input.mediaType)
    assertFileAllowed(await businessFileLimits(input.purpose), mediaType, input.size, name)
    const _id = new Types.ObjectId()
    const id = _id.toString()
    const uploadKey = `businesses/tmp/${id}/${name}`
    await businessTransaction(access, ["businesses.use"], async (current, session, ownerId) => {
        const business = await loadOwnedForWrite(ownerId, businessId, session)
        if (business.status !== "active") throw new DomainError(409, "O negócio está arquivado: restaure-o para alterar.", "BUSINESS_ARCHIVED")
        await businessModels().files.create(
            [{ _id, businessId, ownerId, purpose: input.purpose, pending: true, ready: false, itemId: null, name, mediaType, size: input.size, key: `businesses/${businessId}/files/${id}/${name}`, uploadKey, createdBy: current.userId }],
            { session },
        )
    })
    const url = await getUploadUrl(uploadKey, mediaType, BUSINESS_FILE_UPLOAD_URL_TTL_SECONDS, "browser")
    return { id, method: "PUT", url, headers: { "Content-Type": mediaType }, expiresIn: BUSINESS_FILE_UPLOAD_URL_TTL_SECONDS, purpose: input.purpose }
}

/** Arquivo do dono efetivo (escrita): o suporte nunca envia nem apaga. */
async function ownedFile(access: AccessContext, businessId: string, fileId: string): Promise<BusinessFileDoc> {
    if (!Types.ObjectId.isValid(fileId)) throw notFound()
    const { own } = await loadVisibleBusiness(access, businessId, { audit: false })
    if (!own) throw notFound()
    const doc = await businessModels().files.findOne({ _id: fileId, businessId }).lean<BusinessFileDoc>()
    if (!doc) throw notFound()
    return doc
}

async function discard(doc: BusinessFileDoc): Promise<void> {
    await removeObjectsQuietly([doc.uploadKey])
    await businessModels().files.deleteOne({ _id: doc._id })
}

/** Confirma o envio: HeadObject, tamanho real e cópia para a chave definitiva. */
export async function completeBusinessFile(access: AccessContext, businessId: string, fileId: string): Promise<BusinessFileDto> {
    const doc = await ownedFile(access, businessId, fileId)
    if (doc.ready) return toBusinessFileDto(businessId, refOfFile(doc))
    let head: { contentLength: number | undefined }
    try {
        head = await headFile(doc.uploadKey)
    } catch (error) {
        if (storageErrorInfo(error).kind !== "not_found") throw new DomainError(502, "Não foi possível confirmar o arquivo no storage. Tente novamente em instantes.", "STORAGE_UNAVAILABLE")
        await discard(doc)
        throw new DomainError(400, "O arquivo não chegou ao storage. Envie de novo.", "BUSINESS_FILE_NOT_UPLOADED")
    }
    const size = head.contentLength ?? 0
    const limits = await businessFileLimits(doc.purpose)
    if (size <= 0 || size > limits.maxBytes) {
        await discard(doc)
        throw new DomainError(size <= 0 ? 400 : 413, size <= 0 ? "O arquivo enviado está vazio." : `O arquivo passa do limite de ${formatAttachmentSize(limits.maxBytes)}.`, "BUSINESS_FILE_TOO_LARGE")
    }
    try {
        await copyFile(doc.uploadKey, doc.key)
    } catch {
        throw new DomainError(502, "Não foi possível finalizar o arquivo no storage. Tente novamente em instantes.", "STORAGE_UNAVAILABLE")
    }
    await removeObjectsQuietly([doc.uploadKey])
    await businessModels().files.updateOne({ _id: doc._id }, { $set: { ready: true, size } })
    return toBusinessFileDto(businessId, refOfFile({ ...doc, size }))
}

/** Remove um envio ainda não usado num item. */
export async function deletePendingBusinessFile(access: AccessContext, businessId: string, fileId: string): Promise<{ id: string }> {
    const doc = await ownedFile(access, businessId, fileId)
    if (!doc.pending) throw new DomainError(409, "O arquivo já está em uso num item: remova-o pelo item.", "BUSINESS_FILE_IN_USE")
    await removeObjectsQuietly([doc.uploadKey, doc.key])
    await businessModels().files.deleteOne({ _id: doc._id })
    return { id: fileId }
}

/** Conteúdo do arquivo (dono ou suporte), inline ou para baixar. */
export async function businessFileContent(access: AccessContext, businessId: string, fileId: string, options: { download?: boolean } = {}): Promise<Response> {
    if (!Types.ObjectId.isValid(fileId)) throw notFound()
    await loadVisibleBusiness(access, businessId, { section: "files" })
    const doc = await businessModels().files.findOne({ _id: fileId, businessId, ready: true }).lean<BusinessFileDoc>()
    if (!doc) throw notFound()
    let file
    try {
        file = await getFileObject(doc.key)
    } catch (error) {
        if (storageErrorInfo(error).kind === "not_found") throw notFound()
        throw new DomainError(502, "Não foi possível carregar o arquivo. Tente novamente em instantes.", "STORAGE_UNAVAILABLE")
    }
    // SVG e tipos não inline sempre como download (sem executar conteúdo no domínio do app).
    const inline = !options.download && doc.mediaType !== "image/svg+xml" && (doc.mediaType.startsWith("image/") || doc.mediaType === "application/pdf" || doc.mediaType.startsWith("text/"))
    const headers: Record<string, string> = {
        "Content-Type": doc.mediaType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
        "Cache-Control": "private, max-age=300",
    }
    if (file.contentLength != null) headers["Content-Length"] = String(file.contentLength)
    return new Response(file.body, { status: 200, headers })
}

/**
 * Vincula arquivos confirmados e pendentes a um item (na transação). Falha se algum não existir,
 * não estiver pronto, for de outra finalidade ou já estiver em uso.
 */
export async function claimBusinessFiles(session: ClientSession, businessId: string, purpose: BusinessFilePurpose, itemId: string, fileIds: readonly string[]): Promise<BusinessFileDoc[]> {
    const ids = [...new Set(fileIds)]
    if (!ids.length) return []
    if (ids.some((id) => !Types.ObjectId.isValid(id))) throw notFound()
    const { files } = businessModels()
    const filter = { _id: { $in: ids }, businessId, purpose, pending: true, ready: true }
    const docs = await files.find(filter).session(session).lean<BusinessFileDoc[]>()
    if (docs.length !== ids.length) throw new DomainError(400, "Arquivo não encontrado (expirou, ainda está em envio ou já foi usado): envie de novo.", "BUSINESS_FILE_NOT_FOUND")
    const result = await files.updateMany(filter, { $set: { pending: false, itemId } }, { session })
    if (result.modifiedCount !== ids.length) throw new DomainError(409, "O arquivo já foi usado em outro item.", "BUSINESS_FILE_IN_USE")
    return ids.map((id) => docs.find((doc) => doc._id.toString() === id)!)
}

/** Remove (na transação) os arquivos de um item que saíram dele; devolve as chaves para o storage. */
export async function releaseBusinessFiles(session: ClientSession, businessId: string, fileIds: readonly string[]): Promise<string[]> {
    if (!fileIds.length) return []
    const { files } = businessModels()
    const docs = await files.find({ _id: { $in: fileIds }, businessId }).select({ key: 1, uploadKey: 1 }).session(session).lean()
    await files.deleteMany({ _id: { $in: fileIds }, businessId }, { session })
    return docs.flatMap((doc) => [doc.key, doc.uploadKey])
}

/**
 * Agente Opex: copia um arquivo do chat para o negócio (registro pronto e pendente, com os limites
 * da Plataforma). O item o vincula em seguida, como um envio pela tela.
 */
export async function importChatFile(access: AccessContext, businessId: string, purpose: BusinessFilePurpose, source: { key: string; name: string; mediaType: string; size: number }): Promise<string> {
    const name = safeAttachmentName(source.name)
    const mediaType = mediaTypeOf(name, source.mediaType)
    assertFileAllowed(await businessFileLimits(purpose), mediaType, source.size, name)
    const _id = new Types.ObjectId()
    const id = _id.toString()
    const key = `businesses/${businessId}/files/${id}/${name}`
    await businessTransaction(access, ["businesses.use"], async (current, session, ownerId) => {
        const business = await loadOwnedForWrite(ownerId, businessId, session)
        if (business.status !== "active") throw new DomainError(409, "O negócio está arquivado: restaure-o para alterar.", "BUSINESS_ARCHIVED")
        await businessModels().files.create([{ _id, businessId, ownerId, purpose, pending: true, ready: false, itemId: null, name, mediaType, size: source.size, key, uploadKey: key, createdBy: current.userId }], { session })
    })
    try {
        await copyFile(source.key, key)
    } catch {
        await businessModels().files.deleteOne({ _id })
        throw new DomainError(502, "Não foi possível copiar o arquivo do chat para o negócio. Tente novamente em instantes.", "STORAGE_UNAVAILABLE")
    }
    await businessModels().files.updateOne({ _id }, { $set: { ready: true } })
    return id
}

/** Rotina `businesses-purge`: arquivos enviados e nunca usados há mais de 24 h. */
export async function cleanupPendingBusinessFiles(now: Date = new Date()): Promise<number> {
    await dbConnect()
    const cutoff = new Date(now.getTime() - BUSINESS_FILE_PENDING_TTL_MS)
    const stale = await businessModels().files.find({ pending: true, createdAt: { $lte: cutoff } }).select({ key: 1, uploadKey: 1 }).lean<Pick<BusinessFileDoc, "_id" | "key" | "uploadKey">[]>()
    let removed = 0
    for (const doc of stale) {
        if (await removeObjectsQuietly([doc.uploadKey, doc.key])) continue
        await businessModels().files.deleteOne({ _id: doc._id })
        removed += 1
    }
    return removed
}
