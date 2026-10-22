import { DomainError } from "@/lib/api/route"
import { parseInput } from "@/features/access/server/commands"
import type { AccessContext } from "@/features/access/server/context"
import { auditBusiness } from "@/features/businesses/server/access"
import { claimBusinessFiles, refOfFile, releaseBusinessFiles, toBusinessFileDto } from "@/features/businesses/server/files"
import { auditAction, deleteItem, itemArchived, itemBaseDto, itemCleanup, itemConflict, loadItem, readBusiness, retentionDaysOf, setItemStatus, writeItem } from "@/features/businesses/server/items"
import { businessModels, type BusinessFileRef, type BusinessPortfolioItemRecord } from "@/features/businesses/server/models"
import type { ItemListDto } from "@/features/businesses/types"
import { normalizeTags } from "../logic"
import { portfolioItemCreateSchema, portfolioItemUpdateSchema } from "../schemas"
import type { PortfolioItemDto } from "../types"
import type { PortfolioItemDoc } from "./pool"

/**
 * Itens avulsos do portfólio (M5): projetos só para o portfólio, com título, descrição, galeria de
 * imagens (Storage S3, limites de tamanho dos documentos; só PNG/JPEG/WebP/GIF), link externo, data e
 * categorias/tags. Arquivamento igual aos itens do M2, com o prazo próprio `retentionDays.portfolioItems`.
 */

const KIND = "portfolioItems" as const

export function toPortfolioItemDto(doc: PortfolioItemDoc, retentionDays: number): PortfolioItemDto {
    return {
        ...itemBaseDto(doc, retentionDays),
        title: doc.title,
        description: doc.description ?? null,
        url: doc.url ?? null,
        date: doc.date ?? null,
        tags: doc.tags ?? [],
        images: (doc.images ?? []).map((file) => toBusinessFileDto(doc.businessId, file)),
    }
}

export async function listPortfolioItems(access: AccessContext, businessId: string, status: "active" | "archived" | "all" = "all"): Promise<ItemListDto<PortfolioItemDto>> {
    const { editable } = await readBusiness(access, businessId, "portfolio-items")
    const [docs, days] = await Promise.all([businessModels().portfolioItems.find({ businessId, ...(status === "all" ? {} : { status }) }).sort({ status: 1, createdAt: -1 }).lean<PortfolioItemDoc[]>(), retentionDaysOf(KIND)])
    return { items: docs.map((doc) => toPortfolioItemDto(doc, days)), editable }
}

export async function getPortfolioItem(access: AccessContext, businessId: string, itemId: string): Promise<PortfolioItemDto> {
    await readBusiness(access, businessId, "portfolio-items")
    const doc = (await loadItem(businessModels().portfolioItems, KIND, businessId, itemId, null)) as PortfolioItemDoc
    return toPortfolioItemDto(doc, await retentionDaysOf(KIND))
}

/** Categorias/tags já usadas no negócio (sugestão). */
export async function portfolioTagSuggestions(access: AccessContext, businessId: string): Promise<string[]> {
    await readBusiness(access, businessId, "portfolio-items.tags")
    const values = (await businessModels().portfolioItems.distinct("tags", { businessId })) as string[]
    return normalizeTags(values).sort((a, b) => a.localeCompare(b, "pt-BR"))
}

export async function createPortfolioItem(access: AccessContext, businessId: string, raw: unknown): Promise<PortfolioItemDto> {
    const input = parseInput(portfolioItemCreateSchema, raw)
    const id = await writeItem(access, businessId, KIND, async ({ current, session, ownerId }) => {
        const models = businessModels()
        const [created] = await models.portfolioItems.create(
            [{ businessId, ownerId, title: input.title, description: input.description || null, url: input.url || null, date: input.date ?? null, tags: input.tags, images: [], status: "active", archivedAt: null, version: 0, createdBy: current.userId, updatedBy: current.userId }],
            { session },
        )
        const itemId = created!._id.toString()
        const files = await claimBusinessFiles(session, businessId, "portfolio", itemId, input.imageIds)
        if (files.length) await models.portfolioItems.updateOne({ _id: created!._id }, { $set: { images: files.map(refOfFile) } }, { session })
        await auditBusiness(current, auditAction(KIND, "create"), itemId, null, { businessId, title: input.title, url: input.url ?? null, date: input.date ?? null, tags: input.tags, images: files.map((file) => file.name) }, session)
        return { result: itemId }
    })
    return getPortfolioItem(access, businessId, id)
}

export async function updatePortfolioItem(access: AccessContext, businessId: string, itemId: string, raw: unknown): Promise<PortfolioItemDto> {
    const { version, imageIds, ...patch } = parseInput(portfolioItemUpdateSchema, raw)
    if (!Object.keys(patch).length && imageIds === undefined) throw new DomainError(400, "Nada para alterar", "VALIDATION_ERROR")
    await writeItem(access, businessId, KIND, async ({ current, session }) => {
        const models = businessModels()
        const doc = (await loadItem(models.portfolioItems, KIND, businessId, itemId, session)) as PortfolioItemDoc
        if ((doc.version ?? 0) !== version) throw itemConflict()
        if (doc.status !== "active") throw itemArchived()
        const next: Partial<BusinessPortfolioItemRecord> = {}
        if (patch.title !== undefined) next.title = patch.title
        if (patch.description !== undefined) next.description = patch.description || null
        if (patch.url !== undefined) next.url = patch.url || null
        if (patch.date !== undefined) next.date = patch.date ?? null
        if (patch.tags !== undefined && JSON.stringify(patch.tags) !== JSON.stringify(doc.tags ?? [])) next.tags = patch.tags
        let removeKeys: string[] = []
        if (imageIds !== undefined) {
            const existing = doc.images ?? []
            const kept = existing.filter((file) => imageIds.includes(file.id))
            const removed = existing.filter((file) => !imageIds.includes(file.id))
            const added = await claimBusinessFiles(session, businessId, "portfolio", itemId, imageIds.filter((id) => !existing.some((file) => file.id === id)))
            const byId = new Map<string, BusinessFileRef>([...kept, ...added.map(refOfFile)].map((file) => [file.id, file]))
            const images = imageIds.map((id) => byId.get(id)!).filter(Boolean)
            if (images.map((file) => file.id).join() !== existing.map((file) => file.id).join()) next.images = images
            removeKeys = await releaseBusinessFiles(session, businessId, removed.map((file) => file.id))
        }
        if (!Object.keys(next).length) return { result: undefined }
        const before = Object.fromEntries(Object.keys(next).map((key) => [key, key === "images" ? (doc.images ?? []).map((file) => file.name) : doc[key as keyof BusinessPortfolioItemRecord]]))
        const updated = await models.portfolioItems.updateOne({ _id: doc._id, version }, { $set: { ...next, updatedBy: current.userId }, $inc: { version: 1 } }, { session })
        if (!updated.modifiedCount) throw itemConflict()
        await auditBusiness(current, auditAction(KIND, "update"), itemId, { businessId, ...before }, { businessId, ...next, ...(next.images ? { images: next.images.map((file) => file.name) } : {}) }, session)
        return { result: undefined, removeKeys }
    })
    return getPortfolioItem(access, businessId, itemId)
}

export async function archivePortfolioItem(access: AccessContext, businessId: string, itemId: string): Promise<PortfolioItemDto> {
    await setItemStatus(access, businessModels().portfolioItems, KIND, businessId, itemId, "archived")
    return getPortfolioItem(access, businessId, itemId)
}

export async function restorePortfolioItem(access: AccessContext, businessId: string, itemId: string): Promise<PortfolioItemDto> {
    await setItemStatus(access, businessModels().portfolioItems, KIND, businessId, itemId, "active")
    return getPortfolioItem(access, businessId, itemId)
}

export async function deletePortfolioItem(access: AccessContext, businessId: string, itemId: string): Promise<{ id: string }> {
    return deleteItem(access, businessModels().portfolioItems, KIND, businessId, itemId, (doc, session) => itemCleanup(KIND, doc, session), (doc) => ({ title: doc.title, images: (doc.images ?? []).length }))
}
