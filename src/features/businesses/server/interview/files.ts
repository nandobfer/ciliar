import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { fallbackAttachmentName, formatAttachmentSize, safeAttachmentName } from "@/lib/attachments"
import { loggerFor } from "@/lib/logger"
import { copyFile, deleteFile, getFileObject, getUploadUrl, headFile, storageErrorInfo } from "@/lib/storage/s3"
import type { AccessContext } from "@/features/access/server/context"
import type { OpexFileDto, OpexFileReservationDto } from "@/features/opex-agent/types"
import { loadPlatformState } from "@/features/platform/server/state"
import { INTERVIEW_FILE_PENDING_TTL_MS, INTERVIEW_FILE_UPLOAD_URL_TTL_SECONDS, INTERVIEW_IMAGE_MIMES } from "../../constants"
import type { ReserveInterviewFileInput } from "../../schemas"
import { businessModels, type InterviewFileRecord, type InterviewFileRef } from "../models"
import { loadInterview, toInterviewFileDto } from "./state"

/**
 * Imagem da entrevista (logo/foto) — mesmo fluxo dos arquivos do Agente Opex: reserva com PUT
 * assinado direto no Storage S3, confirmação (HeadObject e tamanho) e vínculo à mensagem. Só
 * imagens, até o tamanho máximo de documentos da Plataforma. Pendentes somem em 24 h.
 */

const log = loggerFor({ module: "businesses", feature: "interview-files" })
type FileDoc = InterviewFileRecord & { _id: Types.ObjectId }

const refOf = (doc: Pick<FileDoc, "_id" | "name" | "mediaType" | "size">): InterviewFileRef => ({ id: doc._id.toString(), name: doc.name, mediaType: doc.mediaType, size: doc.size })
const notFound = () => new DomainError(404, "Arquivo não encontrado", "INTERVIEW_FILE_NOT_FOUND")

export async function interviewImageMaxBytes(): Promise<number> {
    return (await loadPlatformState()).settings.documents.maxFileSizeMb * 1024 * 1024
}

const isImage = (mediaType: string) => (INTERVIEW_IMAGE_MIMES as readonly string[]).includes(mediaType)

async function findFile(id: string, access: AccessContext): Promise<FileDoc> {
    if (!Types.ObjectId.isValid(id)) throw notFound()
    await dbConnect()
    const doc = await businessModels().interviewFiles.findById(id).lean<FileDoc>()
    if (!doc) throw notFound()
    await loadInterview(doc.interviewId.toString(), access)
    return doc
}

async function removeQuietly(key: string | null | undefined): Promise<boolean> {
    if (!key) return true
    try {
        await deleteFile(key)
        return true
    } catch (error) {
        if (storageErrorInfo(error).kind === "not_found") return true
        log.warn({ err: error, key }, "[entrevista] falha ao remover o objeto no storage")
        return false
    }
}

export async function reserveInterviewFile(interviewId: string, input: ReserveInterviewFileInput, access: AccessContext): Promise<OpexFileReservationDto> {
    const interview = await loadInterview(interviewId, access)
    if (interview.status !== "in_progress") throw new DomainError(409, "A entrevista já foi concluída", "INTERVIEW_COMPLETED")
    const mediaType = (input.mediaType?.trim() || "").toLowerCase()
    if (!isImage(mediaType)) throw new DomainError(400, "Envie uma imagem PNG, JPEG, WebP ou GIF.", "INTERVIEW_FILE_TYPE")
    const max = await interviewImageMaxBytes()
    if (input.size > max) throw new DomainError(413, `A imagem tem ${formatAttachmentSize(input.size)}: o limite é ${formatAttachmentSize(max)}`, "INTERVIEW_FILE_TOO_LARGE")
    const name = safeAttachmentName(input.name.trim() || fallbackAttachmentName(mediaType))
    const _id = new Types.ObjectId()
    const id = _id.toString()
    const uploadKey = `interviews/tmp/${id}/${name}`
    await businessModels().interviewFiles.create({ _id, interviewId: interview._id, messageId: null, pending: true, ready: false, name, mediaType, size: input.size, key: `interviews/${interviewId}/${id}/${name}`, uploadKey })
    const url = await getUploadUrl(uploadKey, mediaType, INTERVIEW_FILE_UPLOAD_URL_TTL_SECONDS, "browser")
    return { id, method: "PUT", url, headers: { "Content-Type": mediaType }, expiresIn: INTERVIEW_FILE_UPLOAD_URL_TTL_SECONDS }
}

async function discard(doc: FileDoc): Promise<void> {
    await removeQuietly(doc.uploadKey)
    await businessModels().interviewFiles.deleteOne({ _id: doc._id })
}

export async function completeInterviewFile(id: string, access: AccessContext): Promise<OpexFileDto> {
    const doc = await findFile(id, access)
    if (doc.ready) return toInterviewFileDto(refOf(doc))
    let head: { contentLength: number | undefined; contentType: string | undefined }
    try {
        head = await headFile(doc.uploadKey)
    } catch (error) {
        if (storageErrorInfo(error).kind !== "not_found") throw new DomainError(502, "Não foi possível confirmar a imagem no storage. Tente novamente em instantes.", "STORAGE_UNAVAILABLE")
        await discard(doc)
        throw new DomainError(400, "A imagem não chegou ao storage. Envie de novo.", "INTERVIEW_FILE_NOT_UPLOADED")
    }
    const size = head.contentLength ?? 0
    const max = await interviewImageMaxBytes()
    if (size <= 0 || size > max) {
        await discard(doc)
        throw new DomainError(size <= 0 ? 400 : 413, size <= 0 ? "A imagem enviada está vazia." : `A imagem passa do limite de ${formatAttachmentSize(max)}.`, "INTERVIEW_FILE_TOO_LARGE")
    }
    try {
        await copyFile(doc.uploadKey, doc.key)
    } catch {
        throw new DomainError(502, "Não foi possível finalizar a imagem no storage. Tente novamente em instantes.", "STORAGE_UNAVAILABLE")
    }
    await removeQuietly(doc.uploadKey)
    await businessModels().interviewFiles.updateOne({ _id: doc._id }, { $set: { ready: true, size } })
    return toInterviewFileDto(refOf({ ...doc, size }))
}

export async function deletePendingInterviewFile(id: string, access: AccessContext): Promise<void> {
    const doc = await findFile(id, access)
    if (!doc.pending) throw new DomainError(409, "A imagem já foi enviada numa mensagem", "INTERVIEW_FILE_SENT")
    await removeQuietly(doc.uploadKey)
    await removeQuietly(doc.key)
    await businessModels().interviewFiles.deleteOne({ _id: doc._id })
}

export async function interviewFileContent(id: string, access: AccessContext): Promise<Response> {
    const doc = await findFile(id, access)
    if (!doc.ready) throw notFound()
    let file
    try {
        file = await getFileObject(doc.key)
    } catch (error) {
        if (storageErrorInfo(error).kind === "not_found") throw notFound()
        throw new DomainError(502, "Não foi possível carregar a imagem. Tente novamente em instantes.", "STORAGE_UNAVAILABLE")
    }
    const headers: Record<string, string> = {
        "Content-Type": doc.mediaType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
    }
    if (file.contentLength != null) headers["Content-Length"] = String(file.contentLength)
    return new Response(file.body, { status: 200, headers })
}

/** Vincula as imagens confirmadas à mensagem (atômico: uma imagem não vai em duas mensagens). */
export async function claimInterviewFiles(interviewId: Types.ObjectId, messageId: Types.ObjectId, fileIds: readonly string[]): Promise<InterviewFileRef[]> {
    const ids = [...new Set(fileIds)]
    if (!ids.length) return []
    if (ids.some((id) => !Types.ObjectId.isValid(id))) throw notFound()
    const { interviewFiles } = businessModels()
    const docs = await interviewFiles.find({ _id: { $in: ids }, interviewId, pending: true, ready: true }).lean<FileDoc[]>()
    if (docs.length !== ids.length) throw new DomainError(400, "A imagem não foi encontrada (expirou, ainda está em envio ou já foi enviada): anexe de novo", "INTERVIEW_FILE_NOT_FOUND")
    const result = await interviewFiles.updateMany({ _id: { $in: ids }, interviewId, pending: true, ready: true }, { $set: { pending: false, messageId } })
    if (result.modifiedCount !== ids.length) throw new DomainError(409, "A imagem já foi enviada em outra mensagem", "INTERVIEW_FILE_SENT")
    return docs.map(refOf)
}

/** Imagem enviada nesta entrevista (para `attach_logo`). */
export async function loadInterviewImage(interviewId: Types.ObjectId, fileId: string): Promise<FileDoc> {
    if (!Types.ObjectId.isValid(fileId)) throw new DomainError(404, `Imagem ${fileId} não encontrada nesta entrevista`, "INTERVIEW_FILE_NOT_FOUND")
    const doc = await businessModels().interviewFiles.findOne({ _id: fileId, interviewId, ready: true, pending: false }).lean<FileDoc>()
    if (!doc) throw new DomainError(404, `Imagem ${fileId} não encontrada nesta entrevista (o usuário precisa enviá-la numa mensagem)`, "INTERVIEW_FILE_NOT_FOUND")
    return doc
}

/** Entrevista descartada: apaga os objetos (melhor esforço) e os metadados. */
export async function deleteInterviewFiles(interviewId: Types.ObjectId): Promise<void> {
    const docs = await businessModels().interviewFiles.find({ interviewId }).select({ key: 1, uploadKey: 1 }).lean<Pick<FileDoc, "_id" | "key" | "uploadKey">[]>()
    for (const doc of docs) {
        await removeQuietly(doc.uploadKey)
        await removeQuietly(doc.key)
    }
    await businessModels().interviewFiles.deleteMany({ interviewId })
}

/** Rotina `businesses-purge` também limpa as imagens da entrevista enviadas e nunca usadas há mais de 24 h. */
export async function cleanupPendingInterviewFiles(now: Date = new Date()): Promise<number> {
    await dbConnect()
    const cutoff = new Date(now.getTime() - INTERVIEW_FILE_PENDING_TTL_MS)
    const stale = await businessModels().interviewFiles.find({ pending: true, createdAt: { $lte: cutoff } }).select({ key: 1, uploadKey: 1 }).lean<Pick<FileDoc, "_id" | "key" | "uploadKey">[]>()
    let removed = 0
    for (const doc of stale) {
        if (!(await removeQuietly(doc.uploadKey)) || !(await removeQuietly(doc.key))) continue
        await businessModels().interviewFiles.deleteOne({ _id: doc._id })
        removed += 1
    }
    return removed
}
