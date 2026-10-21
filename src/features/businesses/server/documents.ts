import type { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { parseInput } from "@/features/access/server/commands"
import type { AccessContext } from "@/features/access/server/context"
import { documentCreateSchema, documentUpdateSchema } from "../space-schemas"
import type { DocumentDto, ItemListDto } from "../types"
import { auditBusiness } from "./access"
import { claimBusinessFiles, refOfFile, releaseBusinessFiles, toBusinessFileDto } from "./files"
import { auditAction, deleteItem, itemArchived, itemBaseDto, itemCleanup, itemConflict, loadItem, readBusiness, retentionDaysOf, setItemStatus, writeItem } from "./items"
import { businessModels, type BusinessDocumentRecord } from "./models"

/**
 * Documentos do negócio (M2): nome, arquivo (Storage S3, PUT assinado), categoria, descrição e
 * "usar no portfólio" (M5). Limites de tamanho e tipos em Integrações › Plataforma.
 */

type DocumentDoc = BusinessDocumentRecord & { _id: Types.ObjectId }

export function toDocumentDto(doc: DocumentDoc, retentionDays: number): DocumentDto {
    return {
        ...itemBaseDto(doc, retentionDays),
        name: doc.name,
        category: doc.category ?? null,
        description: doc.description ?? null,
        portfolio: doc.portfolio === true,
        file: toBusinessFileDto(doc.businessId, doc.file),
    }
}

export async function listDocuments(access: AccessContext, businessId: string, status: "active" | "archived" | "all" = "all"): Promise<ItemListDto<DocumentDto>> {
    const { editable } = await readBusiness(access, businessId, "documents")
    const [docs, days] = await Promise.all([businessModels().documents.find({ businessId, ...(status === "all" ? {} : { status }) }).sort({ status: 1, createdAt: -1 }).lean<DocumentDoc[]>(), retentionDaysOf("documents")])
    return { items: docs.map((doc) => toDocumentDto(doc, days)), editable }
}

export async function getDocument(access: AccessContext, businessId: string, documentId: string): Promise<DocumentDto> {
    await readBusiness(access, businessId, "documents")
    const doc = (await loadItem(businessModels().documents, "documents", businessId, documentId, null)) as DocumentDoc
    return toDocumentDto(doc, await retentionDaysOf("documents"))
}

export async function createDocument(access: AccessContext, businessId: string, raw: unknown): Promise<DocumentDto> {
    const input = parseInput(documentCreateSchema, raw)
    const id = await writeItem(access, businessId, "documents", async ({ current, session, ownerId }) => {
        const models = businessModels()
        const [created] = await models.documents.create(
            [{ businessId, ownerId, name: input.name, category: input.category || null, description: input.description || null, portfolio: input.portfolio, file: { id: input.fileId, name: "", mediaType: "", size: 0 }, status: "active", archivedAt: null, version: 0, createdBy: current.userId, updatedBy: current.userId }],
            { session },
        )
        const documentId = created!._id.toString()
        const [file] = await claimBusinessFiles(session, businessId, "document", documentId, [input.fileId])
        await models.documents.updateOne({ _id: created!._id }, { $set: { file: refOfFile(file!) } }, { session })
        await auditBusiness(current, auditAction("documents", "create"), documentId, null, { businessId, name: input.name, category: input.category ?? null, portfolio: input.portfolio, file: file!.name }, session)
        return { result: documentId }
    })
    return getDocument(access, businessId, id)
}

export async function updateDocument(access: AccessContext, businessId: string, documentId: string, raw: unknown): Promise<DocumentDto> {
    const { version, ...patch } = parseInput(documentUpdateSchema, raw)
    if (!Object.keys(patch).length) throw new DomainError(400, "Nada para alterar", "VALIDATION_ERROR")
    await writeItem(access, businessId, "documents", async ({ current, session }) => {
        const models = businessModels()
        const doc = (await loadItem(models.documents, "documents", businessId, documentId, session)) as DocumentDoc
        if ((doc.version ?? 0) !== version) throw itemConflict()
        if (doc.status !== "active") throw itemArchived()
        const next: Partial<BusinessDocumentRecord> = {}
        if (patch.name !== undefined) next.name = patch.name
        if (patch.category !== undefined) next.category = patch.category || null
        if (patch.description !== undefined) next.description = patch.description || null
        if (patch.portfolio !== undefined) next.portfolio = patch.portfolio
        let removeKeys: string[] = []
        if (patch.fileId !== undefined && patch.fileId !== doc.file.id) {
            const [file] = await claimBusinessFiles(session, businessId, "document", documentId, [patch.fileId])
            next.file = refOfFile(file!)
            removeKeys = await releaseBusinessFiles(session, businessId, [doc.file.id])
        }
        if (!Object.keys(next).length) return { result: undefined }
        const before = Object.fromEntries(Object.keys(next).map((key) => [key, key === "file" ? doc.file.name : doc[key as keyof BusinessDocumentRecord]]))
        const updated = await models.documents.updateOne({ _id: doc._id, version }, { $set: { ...next, updatedBy: current.userId }, $inc: { version: 1 } }, { session })
        if (!updated.modifiedCount) throw itemConflict()
        await auditBusiness(current, auditAction("documents", "update"), documentId, { businessId, ...before }, { businessId, ...next, ...(next.file ? { file: next.file.name } : {}) }, session)
        return { result: undefined, removeKeys }
    })
    return getDocument(access, businessId, documentId)
}

export async function archiveDocument(access: AccessContext, businessId: string, documentId: string): Promise<DocumentDto> {
    await setItemStatus(access, businessModels().documents, "documents", businessId, documentId, "archived")
    return getDocument(access, businessId, documentId)
}

export async function restoreDocument(access: AccessContext, businessId: string, documentId: string): Promise<DocumentDto> {
    await setItemStatus(access, businessModels().documents, "documents", businessId, documentId, "active")
    return getDocument(access, businessId, documentId)
}

export async function deleteDocument(access: AccessContext, businessId: string, documentId: string): Promise<{ id: string }> {
    return deleteItem(access, businessModels().documents, "documents", businessId, documentId, (doc, session) => itemCleanup("documents", doc, session), (doc) => ({ name: doc.name, file: doc.file?.name ?? null }))
}
