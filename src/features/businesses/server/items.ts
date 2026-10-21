import mongoose, { Types, type ClientSession, type Model } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { accessModels } from "@/features/access/server/models"
import type { AccessContext } from "@/features/access/server/context"
import { loadPlatformState } from "@/features/platform/server/state"
import { BUSINESS_ITEM_AUDIT, BUSINESS_ITEM_KINDS, BUSINESS_ITEM_LABELS, type BusinessItemKind } from "../constants"
import { auditBusiness, businessTransaction, canUseBusinesses, ensureBusinessCollections } from "./access"
import { loadOwnedForWrite, loadVisibleBusiness, publishSpaceChanged, removeObjectsQuietly } from "./businesses"
import { businessModels, type BusinessRecord } from "./models"

/**
 * Itens do espaço do negócio (M2) — SOMENTE servidor. Regras comuns a atividades, metas, documentos
 * e sucessos: escrita só pelo dono efetivo (`businessTransaction`, fence por dono, acesso relido) em
 * negócio ativo; leitura do dono ou do suporte (`businesses.view_all`, somente leitura e auditado);
 * arquivar/restaurar/excluir definitivamente como o negócio, com prazo de exclusão por tipo.
 */

export const DAY_MS = 24 * 60 * 60 * 1000
export type BusinessDoc = BusinessRecord & { _id: Types.ObjectId }

interface ItemRecord {
    businessId: string
    ownerId: string
    status: "active" | "archived" | "superseded"
    archivedAt: Date | null
    version: number
    createdAt: Date
    updatedAt: Date
}
type ItemFields = ItemRecord & { _id: Types.ObjectId }

const NOT_FOUND: Record<BusinessItemKind, string> = { activities: "Atividade não encontrada", goals: "Meta não encontrada", documents: "Documento não encontrado", successes: "Sucesso não encontrado" }
export const itemNotFound = (kind: BusinessItemKind) => new DomainError(404, NOT_FOUND[kind], "BUSINESS_ITEM_NOT_FOUND")
export const itemConflict = () => new DomainError(409, "O item foi alterado por outra ação. Recarregue e revise antes de salvar.", "VERSION_CONFLICT")
export const itemArchived = () => new DomainError(409, "Restaure o item antes de editá-lo.", "ITEM_ARCHIVED")

export function auditAction(kind: BusinessItemKind, action: string): string {
    return `business.${BUSINESS_ITEM_AUDIT[kind]}.${action}`
}

export async function retentionDaysOf(kind: BusinessItemKind): Promise<number> {
    return (await loadPlatformState()).settings.retentionDays[kind]
}

export function itemBaseDto<S extends ItemRecord["status"]>(doc: ItemFields & { status: S }, retentionDays: number) {
    const archivedAt = doc.archivedAt ? new Date(doc.archivedAt) : null
    return {
        id: doc._id.toString(),
        businessId: doc.businessId,
        status: doc.status,
        archivedAt: archivedAt ? archivedAt.toISOString() : null,
        purgeAt: archivedAt && doc.status === "archived" ? new Date(archivedAt.getTime() + retentionDays * DAY_MS).toISOString() : null,
        version: doc.version ?? 0,
        createdAt: new Date(doc.createdAt).toISOString(),
        updatedAt: new Date(doc.updatedAt).toISOString(),
    }
}

export function assertItemId(kind: BusinessItemKind, id: string): void {
    if (!Types.ObjectId.isValid(id)) throw itemNotFound(kind)
}

/** Leitura: negócio visível (dono ou suporte auditado com a seção) e se a tela pode editar. */
export async function readBusiness(access: AccessContext, businessId: string, section: string): Promise<{ business: BusinessDoc; own: boolean; editable: boolean }> {
    await ensureBusinessCollections()
    const { doc, own } = await loadVisibleBusiness(access, businessId, { section })
    return { business: doc, own, editable: own && canUseBusinesses(access) && doc.status === "active" }
}

/**
 * Escrita num item: transação do dono efetivo (o suporte nunca altera), negócio ativo e o acesso
 * relido. Publica a invalidação do tipo depois do commit e remove do storage as chaves devolvidas.
 */
export async function writeItem<T>(
    access: AccessContext,
    businessId: string,
    kind: BusinessItemKind,
    action: (context: { current: AccessContext; session: ClientSession; business: BusinessDoc; ownerId: string }) => Promise<{ result: T; removeKeys?: string[] }>,
): Promise<T> {
    let ownerId = ""
    const outcome = await businessTransaction(access, ["businesses.use"], async (current, session, owner) => {
        ownerId = owner
        const business = await loadOwnedForWrite(owner, businessId, session)
        if (business.status !== "active") throw new DomainError(409, "O negócio está arquivado: restaure-o para alterar.", "BUSINESS_ARCHIVED")
        return action({ current, session, business, ownerId: owner })
    })
    if (outcome.removeKeys?.length) await removeObjectsQuietly(outcome.removeKeys)
    await publishSpaceChanged(ownerId, businessId, kind)
    return outcome.result
}

/** Item do negócio dentro da transação (404 se for de outro negócio). */
export async function loadItem<T extends ItemRecord>(model: Model<T>, kind: BusinessItemKind, businessId: string, itemId: string, session: ClientSession | null): Promise<T & { _id: Types.ObjectId }> {
    assertItemId(kind, itemId)
    const doc = await model.findOne({ _id: itemId, businessId }).session(session).lean<T & { _id: Types.ObjectId }>()
    if (!doc) throw itemNotFound(kind)
    return doc as T & { _id: Types.ObjectId }
}

/** Arquivar ou restaurar (auditado). */
export async function setItemStatus<T extends ItemRecord>(
    access: AccessContext,
    model: Model<T>,
    kind: BusinessItemKind,
    businessId: string,
    itemId: string,
    target: "active" | "archived",
): Promise<void> {
    await writeItem(access, businessId, kind, async ({ current, session }) => {
        const doc = await loadItem(model, kind, businessId, itemId, session)
        if (doc.status === target) throw new DomainError(409, target === "archived" ? "O item já está arquivado." : "O item já está ativo.", target === "archived" ? "ITEM_ARCHIVED" : "ITEM_ACTIVE")
        await model.updateOne(
            { _id: doc._id },
            { $set: { status: target, archivedAt: target === "archived" ? new Date() : null, updatedBy: current.userId }, $inc: { version: 1 } },
            { session },
        )
        await auditBusiness(current, auditAction(kind, target === "archived" ? "archive" : "restore"), itemId, { businessId, status: doc.status }, { businessId, status: target }, session)
        return { result: undefined }
    })
}

/**
 * Exclusão definitiva manual: só item arquivado (confirmação na tela). `cleanup` apaga os dados
 * ligados ao item na mesma transação e devolve as chaves do storage para remover depois do commit.
 */
export async function deleteItem<T extends ItemRecord>(
    access: AccessContext,
    model: Model<T>,
    kind: BusinessItemKind,
    businessId: string,
    itemId: string,
    cleanup: (doc: T & { _id: Types.ObjectId }, session: ClientSession) => Promise<string[]>,
    summary: (doc: T & { _id: Types.ObjectId }) => Record<string, unknown>,
): Promise<{ id: string }> {
    return writeItem(access, businessId, kind, async ({ current, session }) => {
        const doc = await loadItem(model, kind, businessId, itemId, session)
        if (doc.status !== "archived") throw new DomainError(409, "Arquive o item antes de excluí-lo definitivamente.", "ITEM_NOT_ARCHIVED")
        const removeKeys = await cleanup(doc, session)
        await model.deleteOne({ _id: doc._id }, { session })
        await auditBusiness(current, auditAction(kind, "delete"), itemId, { businessId, ...summary(doc) }, null, session)
        return { result: { id: itemId }, removeKeys }
    })
}

/** Dados ligados a cada tipo de item (exclusão manual e rotina): histórico de preço, arquivos. */
export async function itemCleanup(kind: BusinessItemKind, doc: { _id: Types.ObjectId; businessId: string }, session: ClientSession): Promise<string[]> {
    const models = businessModels()
    const id = doc._id.toString()
    if (kind === "activities") {
        await models.activityPrices.deleteMany({ activityId: id }, { session })
        return []
    }
    if (kind === "documents" || kind === "successes") {
        const files = await models.files.find({ businessId: doc.businessId, itemId: id }).select({ key: 1, uploadKey: 1 }).session(session).lean()
        await models.files.deleteMany({ businessId: doc.businessId, itemId: id }, { session })
        return files.flatMap((file) => [file.key, file.uploadKey])
    }
    return []
}

export function itemModel(kind: BusinessItemKind): Model<ItemRecord & Record<string, unknown>> {
    const models = businessModels()
    const map = { activities: models.activities, goals: models.goals, documents: models.documents, successes: models.successes }
    return map[kind] as unknown as Model<ItemRecord & Record<string, unknown>>
}

const summaryOf = (doc: Record<string, unknown>) => ({ name: (doc.name ?? doc.title ?? null) as string | null })

/**
 * Rotina `businesses-purge`: exclui definitivamente os itens arquivados há mais do que o prazo do
 * tipo (Integrações › Plataforma), com os dados ligados e os objetos no storage. Ator de sistema.
 */
export async function purgeArchivedItems(now: Date = new Date()): Promise<string> {
    await dbConnect()
    await ensureBusinessCollections()
    const settings = (await loadPlatformState()).settings
    const parts: string[] = []
    let storageFailures = 0
    for (const kind of BUSINESS_ITEM_KINDS) {
        const model = itemModel(kind)
        const cutoff = new Date(now.getTime() - settings.retentionDays[kind] * DAY_MS)
        const stale = await model.find({ status: "archived", archivedAt: { $lte: cutoff } }).lean<(ItemFields & Record<string, unknown>)[]>()
        let removed = 0
        const touched = new Map<string, string>()
        for (const doc of stale) {
            const session = await mongoose.startSession()
            let keys: string[] = []
            let done = false
            try {
                await session.withTransaction(async () => {
                    done = false
                    const fresh = await model.findOne({ _id: doc._id, status: "archived", archivedAt: { $lte: cutoff } }).session(session).lean<ItemFields & Record<string, unknown>>()
                    if (!fresh) return
                    keys = await itemCleanup(kind, fresh, session)
                    await model.deleteOne({ _id: fresh._id }, { session })
                    await accessModels().audits.create(
                        [{ actorId: "system:businesses-purge", action: auditAction(kind, "purge"), targetId: fresh._id.toString(), before: { businessId: fresh.businessId, ...summaryOf(fresh), archivedAt: fresh.archivedAt }, after: null }],
                        { session },
                    )
                    done = true
                })
            } finally {
                await session.endSession()
            }
            if (done) {
                removed += 1
                touched.set(doc.businessId, doc.ownerId)
            }
            storageFailures += await removeObjectsQuietly(keys)
        }
        for (const [businessId, ownerId] of touched) await publishSpaceChanged(ownerId, businessId, kind)
        if (removed) parts.push(`${removed} ${BUSINESS_ITEM_LABELS[kind].many.toLowerCase()}`)
    }
    if (!parts.length) return "Nenhum item arquivado vencido"
    return `Itens excluídos definitivamente: ${parts.join(", ")}${storageFailures ? `; ${storageFailures} objeto(s) do storage com falha` : ""}`
}

/** Nomes dos usuários (histórico de preço). */
export async function userNames(ids: readonly string[]): Promise<Map<string, string>> {
    const valid = [...new Set(ids)].filter((id) => Types.ObjectId.isValid(id))
    if (!valid.length) return new Map()
    const users = await accessModels().users.find({ _id: { $in: valid } }).select({ name: 1 }).lean()
    return new Map(users.map((user) => [String(user._id), user.name]))
}

/** Sugestões de categoria: as já usadas no negócio (atividades ou documentos). */
export async function categorySuggestions(access: AccessContext, businessId: string, kind: "activities" | "documents"): Promise<string[]> {
    await readBusiness(access, businessId, `${kind}.categories`)
    const model = (kind === "activities" ? businessModels().activities : businessModels().documents) as unknown as Model<{ businessId: string; category: string | null }>
    const values = (await model.distinct("category", { businessId, category: { $nin: [null, ""] } })) as string[]
    return values.sort((a, b) => a.localeCompare(b, "pt-BR"))
}
