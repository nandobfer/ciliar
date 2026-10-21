import type { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { parseInput } from "@/features/access/server/commands"
import type { AccessContext } from "@/features/access/server/context"
import { successCreateSchema, successUpdateSchema } from "../space-schemas"
import type { ItemListDto, SuccessDto } from "../types"
import { auditBusiness } from "./access"
import { claimBusinessFiles, refOfFile, releaseBusinessFiles, toBusinessFileDto } from "./files"
import { auditAction, deleteItem, itemArchived, itemBaseDto, itemCleanup, itemConflict, loadItem, readBusiness, retentionDaysOf, setItemStatus, writeItem } from "./items"
import { businessModels, type BusinessFileRef, type BusinessSuccessRecord } from "./models"
import { loadOwnedClient } from "@/features/orders/server/clients"

/**
 * Sucessos do negócio (M2): cases/conquistas com título, descrição, data, resultado/métrica e
 * imagens/anexos (mesmos limites dos documentos). Vínculo opcional a um cliente do dono (M3,
 * `clientId`); o vínculo a trabalho entra com o M4 (`workId`).
 */

type SuccessDoc = BusinessSuccessRecord & { _id: Types.ObjectId }

export function toSuccessDto(doc: SuccessDoc, retentionDays: number): SuccessDto {
    return {
        ...itemBaseDto(doc, retentionDays),
        title: doc.title,
        description: doc.description ?? null,
        date: doc.date ?? null,
        result: doc.result ?? null,
        attachments: (doc.attachments ?? []).map((file) => toBusinessFileDto(doc.businessId, file)),
        clientId: doc.clientId ?? null,
        workId: doc.workId ?? null,
    }
}

export async function listSuccesses(access: AccessContext, businessId: string, status: "active" | "archived" | "all" = "all"): Promise<ItemListDto<SuccessDto>> {
    const { editable } = await readBusiness(access, businessId, "successes")
    const [docs, days] = await Promise.all([businessModels().successes.find({ businessId, ...(status === "all" ? {} : { status }) }).sort({ status: 1, date: -1, createdAt: -1 }).lean<SuccessDoc[]>(), retentionDaysOf("successes")])
    return { items: docs.map((doc) => toSuccessDto(doc, days)), editable }
}

export async function getSuccess(access: AccessContext, businessId: string, successId: string): Promise<SuccessDto> {
    await readBusiness(access, businessId, "successes")
    const doc = (await loadItem(businessModels().successes, "successes", businessId, successId, null)) as SuccessDoc
    return toSuccessDto(doc, await retentionDaysOf("successes"))
}

export async function createSuccess(access: AccessContext, businessId: string, raw: unknown): Promise<SuccessDto> {
    const input = parseInput(successCreateSchema, raw)
    const id = await writeItem(access, businessId, "successes", async ({ current, session, ownerId }) => {
        const models = businessModels()
        if (input.clientId) await loadOwnedClient(ownerId, input.clientId, session)
        const [created] = await models.successes.create(
            [{ businessId, ownerId, title: input.title, description: input.description || null, date: input.date ?? null, result: input.result || null, attachments: [], clientId: input.clientId ?? null, workId: null, status: "active", archivedAt: null, version: 0, createdBy: current.userId, updatedBy: current.userId }],
            { session },
        )
        const successId = created!._id.toString()
        const files = await claimBusinessFiles(session, businessId, "success", successId, input.attachmentIds)
        if (files.length) await models.successes.updateOne({ _id: created!._id }, { $set: { attachments: files.map(refOfFile) } }, { session })
        await auditBusiness(current, auditAction("successes", "create"), successId, null, { businessId, title: input.title, date: input.date ?? null, result: input.result ?? null, attachments: files.map((file) => file.name) }, session)
        return { result: successId }
    })
    return getSuccess(access, businessId, id)
}

export async function updateSuccess(access: AccessContext, businessId: string, successId: string, raw: unknown): Promise<SuccessDto> {
    const { version, attachmentIds, ...patch } = parseInput(successUpdateSchema, raw)
    if (!Object.keys(patch).length && attachmentIds === undefined) throw new DomainError(400, "Nada para alterar", "VALIDATION_ERROR")
    await writeItem(access, businessId, "successes", async ({ current, session, ownerId }) => {
        const models = businessModels()
        const doc = (await loadItem(models.successes, "successes", businessId, successId, session)) as SuccessDoc
        if ((doc.version ?? 0) !== version) throw itemConflict()
        if (doc.status !== "active") throw itemArchived()
        const next: Partial<BusinessSuccessRecord> = {}
        if (patch.title !== undefined) next.title = patch.title
        if (patch.description !== undefined) next.description = patch.description || null
        if (patch.date !== undefined) next.date = patch.date ?? null
        if (patch.result !== undefined) next.result = patch.result || null
        if (patch.clientId !== undefined && (patch.clientId ?? null) !== (doc.clientId ?? null)) {
            if (patch.clientId) await loadOwnedClient(ownerId, patch.clientId, session)
            next.clientId = patch.clientId ?? null
        }
        let removeKeys: string[] = []
        if (attachmentIds !== undefined) {
            const existing = doc.attachments ?? []
            const kept = existing.filter((file) => attachmentIds.includes(file.id))
            const removed = existing.filter((file) => !attachmentIds.includes(file.id))
            const added = await claimBusinessFiles(session, businessId, "success", successId, attachmentIds.filter((id) => !existing.some((file) => file.id === id)))
            const byId = new Map<string, BusinessFileRef>([...kept, ...added.map(refOfFile)].map((file) => [file.id, file]))
            const attachments = attachmentIds.map((id) => byId.get(id)!).filter(Boolean)
            if (added.length || removed.length || attachments.map((file) => file.id).join() !== existing.map((file) => file.id).join()) next.attachments = attachments
            removeKeys = await releaseBusinessFiles(session, businessId, removed.map((file) => file.id))
        }
        if (!Object.keys(next).length) return { result: undefined }
        const before = Object.fromEntries(Object.keys(next).map((key) => [key, key === "attachments" ? (doc.attachments ?? []).map((file) => file.name) : doc[key as keyof BusinessSuccessRecord]]))
        const updated = await models.successes.updateOne({ _id: doc._id, version }, { $set: { ...next, updatedBy: current.userId }, $inc: { version: 1 } }, { session })
        if (!updated.modifiedCount) throw itemConflict()
        await auditBusiness(current, auditAction("successes", "update"), successId, { businessId, ...before }, { businessId, ...next, ...(next.attachments ? { attachments: next.attachments.map((file) => file.name) } : {}) }, session)
        return { result: undefined, removeKeys }
    })
    return getSuccess(access, businessId, successId)
}

export async function archiveSuccess(access: AccessContext, businessId: string, successId: string): Promise<SuccessDto> {
    await setItemStatus(access, businessModels().successes, "successes", businessId, successId, "archived")
    return getSuccess(access, businessId, successId)
}

export async function restoreSuccess(access: AccessContext, businessId: string, successId: string): Promise<SuccessDto> {
    await setItemStatus(access, businessModels().successes, "successes", businessId, successId, "active")
    return getSuccess(access, businessId, successId)
}

export async function deleteSuccess(access: AccessContext, businessId: string, successId: string): Promise<{ id: string }> {
    return deleteItem(access, businessModels().successes, "successes", businessId, successId, (doc, session) => itemCleanup("successes", doc, session), (doc) => ({ title: doc.title, attachments: (doc.attachments ?? []).length }))
}
