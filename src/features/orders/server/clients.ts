import mongoose, { Types, type ClientSession } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { publishToChannels } from "@/lib/pusher/channels"
import { businessesChannel } from "@/lib/pusher/channel-names"
import { parseInput } from "@/features/access/server/commands"
import { accessModels } from "@/features/access/server/models"
import type { AccessContext } from "@/features/access/server/context"
import { loadPlatformState } from "@/features/platform/server/state"
import { auditBusiness, businessOwnerOf, businessTransaction, canBusiness, canSupportBusinesses, canUseModule, ensureBusinessCollections, requireModuleRead } from "@/features/businesses/server/access"
import { CLIENT_AUDIT, CLIENTS_UPDATED_EVENT, OPEN_ORDER_STATUSES } from "../constants"
import { clientCreateSchema, clientUpdateSchema, type ClientCreateInput } from "../schemas"
import type { ClientDetailDto, ClientDto, ClientListDto, CurrencyTotalsDto } from "../types"
import { orderModels, type ClientRecord } from "./models"
import { businessModels } from "@/features/businesses/server/models"
import { orderSummaries, orderTotalCents, type OrderDoc } from "./order-dto"

/**
 * Clientes (M3) — SOMENTE servidor. Pertencem ao usuário (dono efetivo, `businessOwnerOf`): o mesmo
 * cliente serve a todos os negócios dele. Escrita só do dono (`businessTransaction`, fence por dono);
 * o suporte (`businesses.view_all`) lê um cliente de outro usuário, somente leitura e auditado.
 * Arquivar como os itens do M2, com prazo próprio (`retentionDays.clients`); cliente com pedidos
 * nunca é excluído definitivamente (nem manual nem pela rotina).
 */

const DAY_MS = 24 * 60 * 60 * 1000
export type ClientDoc = ClientRecord & { _id: Types.ObjectId }

export const clientNotFound = () => new DomainError(404, "Cliente não encontrado", "CLIENT_NOT_FOUND")
const conflict = () => new DomainError(409, "O cliente foi alterado por outra ação. Recarregue e revise antes de salvar.", "VERSION_CONFLICT")

export async function publishClientsChanged(ownerId: string, id: string): Promise<void> {
    await publishToChannels([businessesChannel(ownerId)], CLIENTS_UPDATED_EVENT, { id }).catch(() => undefined)
}

const retentionDays = async () => (await loadPlatformState()).settings.retentionDays.clients

interface ClientStats {
    businessIds: string[]
    orderCount: number
    totals: CurrencyTotalsDto[]
}

/** Pedidos por cliente: negócios, quantidade e totais por moeda (aceitos e abertos). */
export async function clientStats(clientIds: readonly string[], session: ClientSession | null = null): Promise<Map<string, ClientStats>> {
    const result = new Map<string, ClientStats>()
    if (!clientIds.length) return result
    const rows = await orderModels()
        .orders.find({ clientId: { $in: clientIds } })
        .select({ clientId: 1, businessId: 1, currency: 1, status: 1, items: 1, totalOverrideCents: 1 })
        .session(session)
        .lean<Pick<OrderDoc, "clientId" | "businessId" | "currency" | "status" | "items" | "totalOverrideCents">[]>()
    for (const row of rows) {
        const stats = result.get(row.clientId) ?? { businessIds: [], orderCount: 0, totals: [] }
        if (!stats.businessIds.includes(row.businessId)) stats.businessIds.push(row.businessId)
        stats.orderCount += 1
        let totals = stats.totals.find((entry) => entry.currency === row.currency)
        if (!totals) stats.totals.push((totals = { currency: row.currency, acceptedCents: 0, openCents: 0, orders: 0 }))
        totals.orders += 1
        const value = orderTotalCents(row)
        if (row.status === "accepted") totals.acceptedCents += value
        else if (OPEN_ORDER_STATUSES.includes(row.status)) totals.openCents += value
        result.set(row.clientId, stats)
    }
    return result
}

export function toClientDto(doc: ClientDoc, days: number, stats?: ClientStats): ClientDto {
    const archivedAt = doc.archivedAt ? new Date(doc.archivedAt) : null
    return {
        id: doc._id.toString(),
        ownerId: doc.ownerId,
        name: doc.name,
        email: doc.email ?? null,
        phone: doc.phone ?? null,
        notes: doc.notes ?? null,
        status: doc.status,
        archivedAt: archivedAt ? archivedAt.toISOString() : null,
        purgeAt: archivedAt && doc.status === "archived" ? new Date(archivedAt.getTime() + days * DAY_MS).toISOString() : null,
        version: doc.version ?? 0,
        createdAt: new Date(doc.createdAt).toISOString(),
        updatedAt: new Date(doc.updatedAt).toISOString(),
        businessIds: stats?.businessIds ?? [],
        orderCount: stats?.orderCount ?? 0,
        totals: (stats?.totals ?? []).sort((a, b) => a.currency.localeCompare(b.currency)),
    }
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Clientes do dono efetivo (busca por nome/e-mail/telefone, filtro por negócio e situação). */
export async function listClients(access: AccessContext, query: { status?: "active" | "archived" | "all"; businessId?: string; q?: string } = {}): Promise<ClientListDto> {
    requireModuleRead(access, "clients")
    await dbConnect()
    await ensureBusinessCollections()
    const ownerId = businessOwnerOf(access)
    const filter: Record<string, unknown> = { ownerId }
    if (query.status && query.status !== "all") filter.status = query.status
    if (query.q?.trim()) {
        const pattern = { $regex: escapeRegex(query.q.trim()), $options: "i" }
        filter.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }]
    }
    const docs = await orderModels().clients.find(filter).sort({ status: 1, name: 1 }).collation({ locale: "pt" }).lean<ClientDoc[]>()
    const [stats, days] = await Promise.all([clientStats(docs.map((doc) => doc._id.toString())), retentionDays()])
    const items = docs.map((doc) => toClientDto(doc, days, stats.get(doc._id.toString()))).filter((client) => !query.businessId || client.businessIds.includes(query.businessId))
    return { items, editable: canBusiness(access, "clients.edit") }
}

/** Cliente visível: o dono efetivo ou o suporte (somente leitura, auditado). Outros casos: 404. */
export async function loadVisibleClient(access: AccessContext, id: string, options: { audit?: boolean } = {}): Promise<{ doc: ClientDoc; own: boolean }> {
    if (!Types.ObjectId.isValid(id)) throw clientNotFound()
    await dbConnect()
    const doc = await orderModels().clients.findById(id).lean<ClientDoc>()
    if (!doc) throw clientNotFound()
    const own = doc.ownerId === businessOwnerOf(access)
    if (own && canUseModule(access, "clients")) return { doc, own }
    if (!canSupportBusinesses(access)) {
        if (own) requireModuleRead(access, "clients")
        throw clientNotFound()
    }
    if (options.audit !== false) await auditBusiness(access, "business.support_view", id, null, { ownerId: doc.ownerId, section: "client" })
    return { doc, own: false }
}

export async function getClient(access: AccessContext, id: string): Promise<ClientDetailDto> {
    const { doc, own } = await loadVisibleClient(access, id)
    const orders = await orderModels().orders.find({ clientId: id }).sort({ createdAt: -1 }).lean<OrderDoc[]>()
    const [stats, days, summaries] = await Promise.all([clientStats([id]), retentionDays(), orderSummaries(orders)])
    return { ...toClientDto(doc, days, stats.get(id)), orders: canUseModule(access, "orders") || canSupportBusinesses(access) ? summaries : [], own, editable: own && canBusiness(access, "clients.edit") }
}

const clean = (value: string | null | undefined) => (value?.trim() ? value.trim() : null)

/** Cria o cliente dentro de uma transação do dono (tela de clientes ou inline no pedido). */
export async function insertClient(current: AccessContext, session: ClientSession, ownerId: string, input: ClientCreateInput): Promise<string> {
    const [created] = await orderModels().clients.create(
        [{ ownerId, name: input.name, email: clean(input.email), phone: clean(input.phone), notes: clean(input.notes), status: "active", archivedAt: null, version: 0, createdBy: current.userId, updatedBy: current.userId }],
        { session },
    )
    const id = created!._id.toString()
    await auditBusiness(current, `${CLIENT_AUDIT}.create`, id, null, { name: input.name, email: clean(input.email), phone: clean(input.phone) }, session)
    return id
}

/** Cliente ativo do dono (para o pedido, na transação). */
export async function loadOwnedClient(ownerId: string, id: string, session: ClientSession): Promise<ClientDoc> {
    if (!Types.ObjectId.isValid(id)) throw clientNotFound()
    const doc = await orderModels().clients.findById(id).session(session).lean<ClientDoc>()
    if (!doc || doc.ownerId !== ownerId) throw clientNotFound()
    return doc
}

export async function createClient(access: AccessContext, raw: unknown): Promise<ClientDetailDto> {
    const input = parseInput(clientCreateSchema, raw)
    const id = await businessTransaction(access, ["businesses.use", "clients.edit"], (current, session, ownerId) => insertClient(current, session, ownerId, input))
    await publishClientsChanged(businessOwnerOf(access), id)
    return getClient(access, id)
}

export async function updateClient(access: AccessContext, id: string, raw: unknown): Promise<ClientDetailDto> {
    const { version, ...patch } = parseInput(clientUpdateSchema, raw)
    if (!Object.keys(patch).length) throw new DomainError(400, "Nada para alterar", "VALIDATION_ERROR")
    await businessTransaction(access, ["businesses.use", "clients.edit"], async (current, session, ownerId) => {
        const doc = await loadOwnedClient(ownerId, id, session)
        if ((doc.version ?? 0) !== version) throw conflict()
        if (doc.status !== "active") throw new DomainError(409, "Restaure o cliente antes de editá-lo.", "CLIENT_ARCHIVED")
        const next: Partial<ClientRecord> = {}
        if (patch.name !== undefined) next.name = patch.name
        if (patch.email !== undefined) next.email = clean(patch.email)
        if (patch.phone !== undefined) next.phone = clean(patch.phone)
        if (patch.notes !== undefined) next.notes = clean(patch.notes)
        const changed = Object.fromEntries(Object.entries(next).filter(([key, value]) => doc[key as keyof ClientRecord] !== value))
        if (!Object.keys(changed).length) return
        const before = Object.fromEntries(Object.keys(changed).map((key) => [key, doc[key as keyof ClientRecord]]))
        const updated = await orderModels().clients.updateOne({ _id: doc._id, version }, { $set: { ...changed, updatedBy: current.userId }, $inc: { version: 1 } }, { session })
        if (!updated.modifiedCount) throw conflict()
        await auditBusiness(current, `${CLIENT_AUDIT}.update`, id, before, changed, session)
    })
    await publishClientsChanged(businessOwnerOf(access), id)
    return getClient(access, id)
}

async function setClientStatus(access: AccessContext, id: string, target: "active" | "archived"): Promise<ClientDetailDto> {
    await businessTransaction(access, ["businesses.use", "clients.edit"], async (current, session, ownerId) => {
        const doc = await loadOwnedClient(ownerId, id, session)
        if (doc.status === target) throw new DomainError(409, target === "archived" ? "O cliente já está arquivado." : "O cliente já está ativo.", target === "archived" ? "CLIENT_ARCHIVED" : "CLIENT_ACTIVE")
        await orderModels().clients.updateOne({ _id: doc._id }, { $set: { status: target, archivedAt: target === "archived" ? new Date() : null, updatedBy: current.userId }, $inc: { version: 1 } }, { session })
        await auditBusiness(current, `${CLIENT_AUDIT}.${target === "archived" ? "archive" : "restore"}`, id, { status: doc.status }, { status: target }, session)
    })
    await publishClientsChanged(businessOwnerOf(access), id)
    return getClient(access, id)
}

export const archiveClient = (access: AccessContext, id: string) => setClientStatus(access, id, "archived")
export const restoreClient = (access: AccessContext, id: string) => setClientStatus(access, id, "active")

const hasOrders = () => new DomainError(409, "O cliente tem pedidos e não pode ser excluído definitivamente: ele fica arquivado.", "CLIENT_HAS_ORDERS")

/** Exclusão definitiva manual: só arquivado e sem nenhum pedido (irreversível). */
export async function deleteClient(access: AccessContext, id: string): Promise<{ id: string }> {
    await businessTransaction(access, ["businesses.use", "clients.delete"], async (current, session, ownerId) => {
        const doc = await loadOwnedClient(ownerId, id, session)
        if (doc.status !== "archived") throw new DomainError(409, "Arquive o cliente antes de excluí-lo definitivamente.", "CLIENT_NOT_ARCHIVED")
        if (await orderModels().orders.exists({ clientId: id }).session(session)) throw hasOrders()
        await orderModels().clients.deleteOne({ _id: doc._id }, { session })
        await auditBusiness(current, `${CLIENT_AUDIT}.delete`, id, { name: doc.name }, null, session)
    })
    await publishClientsChanged(businessOwnerOf(access), id)
    return { id }
}

/**
 * Rotina `businesses-purge`: exclui definitivamente os clientes arquivados há mais do que o prazo
 * de clientes (Integrações › Plataforma). Clientes com pedidos ficam arquivados. Ator de sistema.
 */
export async function purgeArchivedClients(now: Date = new Date()): Promise<string> {
    await dbConnect()
    await ensureBusinessCollections()
    const days = await retentionDays()
    const cutoff = new Date(now.getTime() - days * DAY_MS)
    const { clients, orders } = orderModels()
    const stale = await clients.find({ status: "archived", archivedAt: { $lte: cutoff } }).lean<ClientDoc[]>()
    let removed = 0
    let kept = 0
    for (const doc of stale) {
        const session = await mongoose.startSession()
        let done = false
        try {
            await session.withTransaction(async () => {
                done = false
                await businessModels().ownerStates.updateOne({ _id: doc.ownerId }, { $inc: { fence: 1 } }, { session, upsert: true })
                const fresh = await clients.findOne({ _id: doc._id, status: "archived", archivedAt: { $lte: cutoff } }).session(session).lean<ClientDoc>()
                if (!fresh) return
                if (await orders.exists({ clientId: fresh._id.toString() }).session(session)) {
                    kept += 1
                    return
                }
                await clients.deleteOne({ _id: fresh._id }, { session })
                await accessModels().audits.create([{ actorId: "system:businesses-purge", action: `${CLIENT_AUDIT}.purge`, targetId: fresh._id.toString(), before: { name: fresh.name, ownerId: fresh.ownerId, archivedAt: fresh.archivedAt }, after: null }], { session })
                done = true
            })
        } finally {
            await session.endSession()
        }
        if (done) {
            removed += 1
            await publishClientsChanged(doc.ownerId, doc._id.toString())
        }
    }
    if (!removed) return kept ? `Nenhum cliente excluído (${kept} com pedidos ficam arquivados)` : "Nenhum cliente arquivado vencido"
    return `${removed} cliente(s) excluído(s) definitivamente${kept ? `; ${kept} com pedidos ficam arquivados` : ""}`
}
