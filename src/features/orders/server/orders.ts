import { randomUUID } from "node:crypto"
import { Types, type ClientSession } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { runAfterResponse } from "@/lib/after-response"
import { todayKeyIn, normalizeTimeZone } from "@/lib/timezone"
import { parseInput } from "@/features/access/server/commands"
import { denied } from "@/features/access/server/access"
import { accessModels } from "@/features/access/server/models"
import type { AccessContext } from "@/features/access/server/context"
import { auditBusiness, businessOwnerOf, canSupportBusinesses, canUseBusinesses, ensureBusinessCollections } from "@/features/businesses/server/access"
import { businessModels } from "@/features/businesses/server/models"
import { claimBusinessFiles, refOfFile, releaseBusinessFiles } from "@/features/businesses/server/files"
import { readBusiness, writeItem, type BusinessDoc } from "@/features/businesses/server/items"
import { publishSpaceChanged } from "@/features/businesses/server/businesses"
import { ORDER_AUDIT, orderCode, type OrderAction, type OrderStatus } from "../constants"
import { addDaysToKey, allowedOrderActions, canOrderTransition, sameSnapshot, totalMinutes, type OrderSnapshot } from "../logic"
import { orderCreateSchema, orderRejectSchema, orderSendSchema, orderUpdateSchema, orderVersionActionSchema, type OrderItemInput } from "../schemas"
import type { OrderDto, OrderLinkUrlDto, OrderListDto, OrderSendResultDto } from "../types"
import { insertClient, loadOwnedClient, publishClientsChanged } from "./clients"
import { orderModels, type OrderAttachmentRecord, type OrderDecisionRecord, type OrderItemRecord, type OrderRecord } from "./models"
import { orderSummaries, orderTotalCents, snapshotOf, toOrderDto, type OrderDoc, type OrderVersionDoc } from "./order-dto"
import { newQuoteToken, quoteUrl, quoteUrlOf } from "./link"
import { sendQuoteEmail } from "./notify"
import { workModels } from "@/features/works/server/models"

/**
 * Pedidos (M3) — SOMENTE servidor. Cada pedido é de um negócio (moeda do negócio, código
 * sequencial `PED-0001` por negócio) e de um cliente do dono. Escrita pelo dono efetivo em negócio
 * ativo (`writeItem`: fence por dono, acesso relido, versão otimista); leitura do dono ou do suporte
 * (somente leitura, auditado). Estados e versões em `aicontext/modules/orders.md`.
 */

export const orderNotFound = () => new DomainError(404, "Pedido não encontrado", "ORDER_NOT_FOUND")
const conflict = () => new DomainError(409, "O pedido foi alterado por outra ação. Recarregue e revise antes de salvar.", "VERSION_CONFLICT")
const invalidTransition = (status: OrderStatus, action: OrderAction) => {
    const messages: Record<OrderAction, string> = {
        edit: "Só rascunhos e pedidos enviados podem ser editados.",
        send: "Só rascunhos e pedidos enviados podem ser enviados.",
        revoke: "Só pedidos enviados têm link para revogar.",
        accept: "Só pedidos enviados podem ser aceitos.",
        reject: "Só pedidos enviados podem ser recusados.",
        reopen: "Só pedidos recusados podem ser reabertos.",
        cancel: "Só rascunhos e pedidos enviados podem ser cancelados.",
    }
    return new DomainError(409, messages[action], "ORDER_INVALID_TRANSITION", { status, action })
}

/** Contato comercial sem e-mail usa o e-mail atual da conta do dono (P51). */
export async function ownerAccountEmail(ownerId: string): Promise<string | null> {
    if (!Types.ObjectId.isValid(ownerId)) return null
    const user = await accessModels().users.findById(ownerId).select({ email: 1 }).lean<{ email?: string }>()
    return user?.email ?? null
}

function assertOrderId(id: string): void {
    if (!Types.ObjectId.isValid(id)) throw orderNotFound()
}

async function loadOrder(businessId: string, orderId: string, session: ClientSession | null): Promise<OrderDoc> {
    assertOrderId(orderId)
    const doc = await orderModels().orders.findOne({ _id: orderId, businessId }).session(session).lean<OrderDoc>()
    if (!doc) throw orderNotFound()
    return doc
}

const editableStatuses: readonly OrderStatus[] = ["draft", "sent"]

export async function getOrder(access: AccessContext, businessId: string, orderId: string): Promise<OrderDto> {
    const { editable } = await readBusiness(access, businessId, "orders")
    const doc = await loadOrder(businessId, orderId, null)
    return toOrderDto(doc, { editable: editable && editableStatuses.includes(doc.status), actions: editable ? allowedOrderActions(doc.status) : [] })
}

/** Pedidos de um negócio (dono ou suporte). */
export async function listBusinessOrders(access: AccessContext, businessId: string, query: { status?: OrderStatus; clientId?: string } = {}): Promise<OrderListDto> {
    const { editable } = await readBusiness(access, businessId, "orders")
    const filter: Record<string, unknown> = { businessId }
    if (query.status) filter.status = query.status
    if (query.clientId) filter.clientId = query.clientId
    const docs = await orderModels().orders.find(filter).sort({ number: -1 }).lean<OrderDoc[]>()
    return { items: await orderSummaries(docs), editable }
}

/** Visão global (`/pedidos`): todos os pedidos dos negócios do dono efetivo, com filtros. */
export async function listOrders(access: AccessContext, query: { businessId?: string; clientId?: string; status?: OrderStatus } = {}): Promise<OrderListDto> {
    if (!canUseBusinesses(access) && !canSupportBusinesses(access)) throw denied("Seu perfil não permite usar Negócios.")
    await dbConnect()
    await ensureBusinessCollections()
    const filter: Record<string, unknown> = { ownerId: businessOwnerOf(access) }
    if (query.businessId) filter.businessId = query.businessId
    if (query.clientId) filter.clientId = query.clientId
    if (query.status) filter.status = query.status
    const docs = await orderModels().orders.find(filter).sort({ createdAt: -1 }).lean<OrderDoc[]>()
    return { items: await orderSummaries(docs), editable: canUseBusinesses(access) }
}

// ── Itens e anexos ─────────────────────────────────────────────────────────

/**
 * Itens: os existentes (pelo `id`) mantêm a atividade e o valor/hora congelado; os novos exigem
 * uma atividade ATIVA do negócio e copiam o valor/hora agora.
 */
export async function resolveItems(session: ClientSession, businessId: string, existing: readonly OrderItemRecord[], input: readonly OrderItemInput[]): Promise<OrderItemRecord[]> {
    const activityIds = [...new Set(input.flatMap((item) => (item.activityId ? [item.activityId] : [])))]
    const activities = activityIds.length ? await businessModels().activities.find({ _id: { $in: activityIds }, businessId }).session(session).lean() : []
    return input.map((item) => {
        if (item.id) {
            const current = existing.find((entry) => entry.id === item.id)
            if (!current) throw new DomainError(400, "Item do pedido não encontrado: recarregue o pedido.", "ORDER_ITEM_NOT_FOUND")
            return { ...current, minutes: item.minutes }
        }
        const activity = activities.find((entry) => String(entry._id) === item.activityId)
        if (!activity) throw new DomainError(400, "Atividade não encontrada neste negócio.", "ACTIVITY_NOT_FOUND")
        if (activity.status !== "active" || activity.active === false) throw new DomainError(409, `A atividade "${activity.name}" está inativa ou arquivada: só atividades ativas entram em novos itens.`, "ACTIVITY_INACTIVE")
        return { id: randomUUID(), activityId: String(activity._id), activityName: activity.name, minutes: item.minutes, hourlyRateCents: activity.hourlyRateCents }
    })
}

async function resolveAttachments(
    session: ClientSession,
    businessId: string,
    orderId: string,
    existing: readonly OrderAttachmentRecord[],
    input: readonly { fileId: string; clientVisible: boolean }[],
): Promise<{ attachments: OrderAttachmentRecord[]; removeKeys: string[] }> {
    const added = await claimBusinessFiles(session, businessId, "order", orderId, input.filter((file) => !existing.some((entry) => entry.id === file.fileId)).map((file) => file.fileId))
    const removed = existing.filter((entry) => !input.some((file) => file.fileId === entry.id))
    const attachments = input.map((file) => {
        const current = existing.find((entry) => entry.id === file.fileId)
        const ref = current ?? refOfFile(added.find((doc) => doc._id.toString() === file.fileId)!)
        return { id: ref.id, name: ref.name, mediaType: ref.mediaType, size: ref.size, clientVisible: file.clientVisible }
    })
    return { attachments, removeKeys: await releaseBusinessFiles(session, businessId, removed.map((file) => file.id)) }
}

// ── Versões ────────────────────────────────────────────────────────────────

async function latestVersion(orderId: string, session: ClientSession): Promise<OrderVersionDoc | null> {
    return orderModels().orderVersions.findOne({ orderId }).sort({ number: -1 }).session(session).lean<OrderVersionDoc>()
}

export async function recordVersion(session: ClientSession, current: AccessContext, order: OrderDoc, snapshot: OrderSnapshot, reason: "send" | "edit" | "reopen" | "work", published: boolean): Promise<number> {
    const number = (order.versionCount ?? 0) + 1
    await orderModels().orderVersions.create([{ orderId: order._id.toString(), businessId: order.businessId, number, reason, published, snapshot, actorId: current.userId, simulation: current.dto.simulation ?? null }], { session })
    await orderModels().orders.updateOne({ _id: order._id }, { $set: { versionCount: number } }, { session })
    await auditBusiness(current, `${ORDER_AUDIT}.version`, order._id.toString(), null, { businessId: order.businessId, code: order.code, number, reason, published }, session)
    return number
}

// ── Criar e editar ─────────────────────────────────────────────────────────

/** Pede o título/resumo à IA em segundo plano (nunca bloqueia o formulário). */
function scheduleTitle(orderId: string): void {
    runAfterResponse("order-title", async () => {
        const { generateOrderTitle } = await import("./ai")
        await generateOrderTitle(orderId)
    })
}

const needsAi = (order: Pick<OrderRecord, "titleManual" | "summaryManual">) => !(order.titleManual && order.summaryManual)

async function afterWrite(ownerId: string, businessId: string, clientIds: readonly string[]): Promise<void> {
    await publishSpaceChanged(ownerId, businessId, "orders")
    for (const clientId of new Set(clientIds)) await publishClientsChanged(ownerId, clientId)
}

export async function createOrder(access: AccessContext, businessId: string, raw: unknown): Promise<OrderDto> {
    const input = parseInput(orderCreateSchema, raw)
    let ownerId = ""
    let clientId = ""
    const id = await writeItem(access, businessId, "orders", async ({ current, session, business, ownerId: owner }) => {
        ownerId = owner
        if (input.newClient) clientId = await insertClient(current, session, owner, input.newClient)
        else {
            const client = await loadOwnedClient(owner, input.clientId!, session)
            if (client.status !== "active") throw new DomainError(409, "O cliente está arquivado: restaure-o para usar em novos pedidos.", "CLIENT_ARCHIVED")
            clientId = client._id.toString()
        }
        const updated = await businessModels().businesses.findOneAndUpdate({ _id: business._id }, { $inc: { orderSeq: 1 } }, { session, returnDocument: "after" }).lean<BusinessDoc>()
        const number = updated!.orderSeq
        const _id = new Types.ObjectId()
        const orderId = _id.toString()
        const items = await resolveItems(session, businessId, [], input.items)
        const { attachments } = await resolveAttachments(session, businessId, orderId, [], input.attachments)
        const title = input.title?.trim() || null
        const summary = input.summary?.trim() || null
        const record = {
            _id,
            businessId,
            ownerId: owner,
            clientId,
            number,
            code: orderCode(number),
            currency: business.currency,
            description: input.description,
            title,
            summary,
            titleManual: Boolean(title),
            summaryManual: Boolean(summary),
            aiStatus: (needsAi({ titleManual: Boolean(title), summaryManual: Boolean(summary) }) ? "pending" : "idle") as OrderRecord["aiStatus"],
            aiError: null,
            aiSourceHash: null,
            items,
            totalOverrideCents: input.totalOverrideCents ?? null,
            dueDate: input.dueDate ?? null,
            attachments,
            status: "draft" as OrderStatus,
            link: null,
            firstSentAt: null,
            versionCount: 0,
            decisions: [],
            cancelledAt: null,
            workId: null,
            version: 0,
            createdBy: current.userId,
            updatedBy: current.userId,
        }
        await orderModels().orders.create([record], { session })
        await auditBusiness(current, `${ORDER_AUDIT}.create`, orderId, null, { businessId, code: record.code, clientId, items: items.length, totalCents: orderTotalCents(record), dueDate: record.dueDate, attachments: attachments.length }, session)
        return { result: orderId }
    })
    await afterWrite(ownerId, businessId, [clientId])
    const order = await getOrder(access, businessId, id)
    if (order.aiStatus === "pending") scheduleTitle(id)
    return order
}

export async function updateOrder(access: AccessContext, businessId: string, orderId: string, raw: unknown): Promise<OrderDto> {
    const { version, ...patch } = parseInput(orderUpdateSchema, raw)
    if (!Object.keys(patch).length) throw new DomainError(400, "Nada para alterar", "VALIDATION_ERROR")
    let ownerId = ""
    let touchedClients: string[] = []
    let regenerate = false
    await writeItem(access, businessId, "orders", async ({ current, session, ownerId: owner }) => {
        ownerId = owner
        const doc = await loadOrder(businessId, orderId, session)
        if ((doc.version ?? 0) !== version) throw conflict()
        if (!canOrderTransition(doc.status, "edit")) throw invalidTransition(doc.status, "edit")
        const next: Partial<OrderRecord> = {}
        let removeKeys: string[] = []
        if (patch.newClient) next.clientId = await insertClient(current, session, owner, patch.newClient)
        else if (patch.clientId && patch.clientId !== doc.clientId) {
            const client = await loadOwnedClient(owner, patch.clientId, session)
            if (client.status !== "active") throw new DomainError(409, "O cliente está arquivado: restaure-o para usar no pedido.", "CLIENT_ARCHIVED")
            next.clientId = patch.clientId
        }
        if (patch.description !== undefined && patch.description !== doc.description) next.description = patch.description
        if (patch.title !== undefined) {
            const value = patch.title?.trim() || null
            if (value !== (doc.titleManual ? doc.title : null)) Object.assign(next, value ? { title: value, titleManual: true } : { title: null, titleManual: false })
        }
        if (patch.summary !== undefined) {
            const value = patch.summary?.trim() || null
            if (value !== (doc.summaryManual ? doc.summary : null)) Object.assign(next, value ? { summary: value, summaryManual: true } : { summary: null, summaryManual: false })
        }
        if (patch.items !== undefined) {
            const items = await resolveItems(session, businessId, doc.items ?? [], patch.items)
            if (JSON.stringify(items) !== JSON.stringify(doc.items ?? [])) next.items = items
        }
        if (patch.totalOverrideCents !== undefined && (patch.totalOverrideCents ?? null) !== (doc.totalOverrideCents ?? null)) next.totalOverrideCents = patch.totalOverrideCents ?? null
        if (patch.dueDate !== undefined && (patch.dueDate ?? null) !== (doc.dueDate ?? null)) next.dueDate = patch.dueDate ?? null
        if (patch.attachments !== undefined) {
            const resolved = await resolveAttachments(session, businessId, orderId, doc.attachments ?? [], patch.attachments)
            if (JSON.stringify(resolved.attachments) !== JSON.stringify(doc.attachments ?? [])) next.attachments = resolved.attachments
            removeKeys = resolved.removeKeys
        }
        if (!Object.keys(next).length) return { result: undefined, removeKeys }
        const merged = { ...doc, ...next } as OrderDoc
        if (next.description !== undefined) {
            if (!merged.titleManual) next.title = merged.title = null
            if (!merged.summaryManual) next.summary = merged.summary = null
        }
        // A IA refaz o que não é manual quando a descrição muda (ou quando um campo volta para a IA).
        regenerate = needsAi(merged) && (next.description !== undefined || (patch.title !== undefined && !merged.titleManual) || (patch.summary !== undefined && !merged.summaryManual))
        if (regenerate) Object.assign(next, { aiStatus: "pending", aiError: null })
        else if (!needsAi(merged)) Object.assign(next, { aiStatus: "idle", aiError: null })
        const updated = await orderModels().orders.updateOne({ _id: doc._id, version }, { $set: { ...next, updatedBy: current.userId }, $inc: { version: 1 } }, { session })
        if (!updated.modifiedCount) throw conflict()
        const before = Object.fromEntries(Object.keys(next).filter((key) => !key.startsWith("ai")).map((key) => [key, summarizeField(key, doc[key as keyof OrderRecord])]))
        const after = Object.fromEntries(Object.keys(next).filter((key) => !key.startsWith("ai")).map((key) => [key, summarizeField(key, next[key as keyof OrderRecord])]))
        await auditBusiness(current, `${ORDER_AUDIT}.update`, orderId, { businessId, code: doc.code, ...before }, { businessId, code: doc.code, ...after }, session)
        // Depois do primeiro envio, cada alteração gera uma versão (publicada se o link está ativo).
        if (doc.firstSentAt) {
            const snapshot = snapshotOf(merged)
            await recordVersion(session, current, { ...merged, versionCount: doc.versionCount ?? 0 }, snapshot, "edit", doc.status === "sent")
        }
        touchedClients = [doc.clientId, ...(next.clientId ? [next.clientId] : [])]
        return { result: undefined, removeKeys }
    })
    await afterWrite(ownerId, businessId, touchedClients)
    if (regenerate) scheduleTitle(orderId)
    return getOrder(access, businessId, orderId)
}

function summarizeField(key: string, value: unknown): unknown {
    if (key === "items") return (value as OrderItemRecord[] | undefined)?.map((item) => ({ activityName: item.activityName, minutes: item.minutes, hourlyRateCents: item.hourlyRateCents })) ?? []
    if (key === "attachments") return (value as OrderAttachmentRecord[] | undefined)?.map((file) => ({ name: file.name, clientVisible: file.clientVisible })) ?? []
    if (key === "description" && typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value
    return value ?? null
}

// ── Envio e link ───────────────────────────────────────────────────────────

/**
 * Envia (Rascunho → Enviado) ou renova (Enviado): gera o link com token novo quando não há link
 * válido; prorrogar um link ainda válido mantém o token. Grava a versão enviada e, se pedido,
 * manda o e-mail ao cliente (SMTP) depois do commit.
 */
export async function sendOrder(access: AccessContext, businessId: string, orderId: string, raw: unknown): Promise<OrderSendResultDto> {
    const input = parseInput(orderSendSchema, raw)
    const timeZone = normalizeTimeZone(access.timeZone)
    const today = todayKeyIn(timeZone)
    let ownerId = ""
    let url = ""
    let mail: Omit<Parameters<typeof sendQuoteEmail>[0], "url"> | null = null
    let emailResult: OrderSendResultDto["email"] = null
    await writeItem(access, businessId, "orders", async ({ current, session, business, ownerId: owner }) => {
        ownerId = owner
        const doc = await loadOrder(businessId, orderId, session)
        if ((doc.version ?? 0) !== input.version) throw conflict()
        if (!canOrderTransition(doc.status, "send")) throw invalidTransition(doc.status, "send")
        if (!(doc.items ?? []).length) throw new DomainError(400, "Inclua ao menos um item (atividade e horas) antes de enviar.", "ORDER_WITHOUT_ITEMS")
        const validUntil = input.validUntil ?? addDaysToKey(today, business.quoteValidityDays ?? 15)
        if (validUntil < today) throw new DomainError(400, "A validade do link não pode ser anterior a hoje.", "ORDER_VALIDITY_PAST")
        const reuse = doc.status === "sent" && doc.link && doc.link.validUntil >= todayKeyIn(doc.link.timeZone ?? timeZone)
        const fresh = reuse ? null : newQuoteToken()
        const link = reuse ? { ...doc.link!, validUntil, timeZone } : { tokenBox: fresh!.tokenBox, tokenHash: fresh!.tokenHash, validUntil, timeZone, sentAt: new Date(), emailedAt: null }
        url = fresh ? quoteUrl(fresh.token) : quoteUrlOf(doc.link!.tokenBox)
        if (input.email) {
            const client = await loadOwnedClient(owner, doc.clientId, session)
            if (client.email) {
                const snapshot = snapshotOf(doc)
                mail = {
                    to: client.email,
                    clientName: client.name,
                    business: { name: business.name, theme: business.theme, contactEmail: business.contactEmail ?? (await ownerAccountEmail(owner)), contactPhone: business.contactPhone ?? null },
                    code: doc.code,
                    title: snapshot.title,
                    validUntil,
                    totalCents: snapshot.totalCents,
                    currency: doc.currency,
                }
            } else emailResult = "no-email"
        }
        const updated = await orderModels().orders.updateOne(
            { _id: doc._id, version: input.version },
            { $set: { status: "sent", link, firstSentAt: doc.firstSentAt ?? new Date(), updatedBy: current.userId }, $inc: { version: 1 } },
            { session },
        )
        if (!updated.modifiedCount) throw conflict()
        const snapshot = snapshotOf(doc)
        const last = await latestVersion(orderId, session)
        if (last && sameSnapshot(last.snapshot, snapshot)) {
            if (!last.published) await orderModels().orderVersions.updateOne({ _id: last._id }, { $set: { published: true } }, { session })
        } else await recordVersion(session, current, doc, snapshot, "send", true)
        await auditBusiness(current, `${ORDER_AUDIT}.send`, orderId, { businessId, code: doc.code, status: doc.status, validUntil: doc.link?.validUntil ?? null }, { businessId, code: doc.code, status: "sent", validUntil, newToken: !reuse, email: input.email }, session)
        return { result: undefined }
    })
    const pendingMail = mail as Omit<Parameters<typeof sendQuoteEmail>[0], "url"> | null
    if (pendingMail) {
        const result = await sendQuoteEmail({ ...pendingMail, url })
        emailResult = result
        if (result === "sent") await orderModels().orders.updateOne({ _id: orderId, "link.tokenHash": { $exists: true } }, { $set: { "link.emailedAt": new Date() } })
        await auditBusiness(access, `${ORDER_AUDIT}.email`, orderId, null, { businessId, code: pendingMail.code, to: pendingMail.to, result })
    }
    await afterWrite(ownerId, businessId, [])
    return { order: await getOrder(access, businessId, orderId), url, email: emailResult }
}

/** "Copiar link": decifra o token enquanto o link estiver válido (só o dono). */
export async function orderLinkUrl(access: AccessContext, businessId: string, orderId: string): Promise<OrderLinkUrlDto> {
    const { own } = await readBusiness(access, businessId, "orders")
    if (!own || !canUseBusinesses(access)) throw orderNotFound()
    const doc = await loadOrder(businessId, orderId, null)
    if (!doc.link) throw new DomainError(409, "O pedido não tem link ativo: envie o pedido para gerar o link.", "ORDER_WITHOUT_LINK")
    if (doc.status === "sent" && doc.link.validUntil < todayKeyIn(doc.link.timeZone)) throw new DomainError(409, "O link expirou: reenvie o pedido para gerar um novo.", "ORDER_LINK_EXPIRED")
    return { url: quoteUrlOf(doc.link.tokenBox), validUntil: doc.link.validUntil }
}

/** Ações de status do prestador (revogar, reabrir, cancelar, aceitar e recusar). */
async function transition(
    access: AccessContext,
    businessId: string,
    orderId: string,
    action: Exclude<OrderAction, "edit" | "send">,
    version: number,
    extra: { reason?: string | null } = {},
): Promise<OrderDto> {
    let ownerId = ""
    let clientId = ""
    await writeItem(access, businessId, "orders", async ({ current, session, ownerId: owner }) => {
        ownerId = owner
        const doc = await loadOrder(businessId, orderId, session)
        clientId = doc.clientId
        if ((doc.version ?? 0) !== version) throw conflict()
        if (!canOrderTransition(doc.status, action)) throw invalidTransition(doc.status, action)
        if (action === "accept" || action === "reject") {
            await applyDecision(session, doc, { kind: action, by: "provider", actorId: current.userId, name: current.name, reason: extra.reason?.trim() || null, ip: null }, async (name, before, after) => auditBusiness(current, name, orderId, before, after, session))
            return { result: undefined }
        }
        const set: Record<string, unknown> = { status: action === "cancel" ? "cancelled" : "draft", link: null, updatedBy: current.userId }
        if (action === "cancel") set.cancelledAt = new Date()
        const updated = await orderModels().orders.updateOne({ _id: doc._id, version }, { $set: set, $inc: { version: 1 } }, { session })
        if (!updated.modifiedCount) throw conflict()
        if (action === "reopen") await recordVersion(session, current, doc, snapshotOf(doc), "reopen", false)
        await auditBusiness(current, `${ORDER_AUDIT}.${action === "revoke" ? "revoke" : action}`, orderId, { businessId, code: doc.code, status: doc.status, link: Boolean(doc.link) }, { businessId, code: doc.code, status: set.status, link: false }, session)
        return { result: undefined }
    })
    await afterWrite(ownerId, businessId, [clientId])
    return getOrder(access, businessId, orderId)
}

export const revokeOrderLink = (access: AccessContext, businessId: string, orderId: string, raw: unknown) => transition(access, businessId, orderId, "revoke", parseInput(orderVersionActionSchema, raw).version)
export const reopenOrder = (access: AccessContext, businessId: string, orderId: string, raw: unknown) => transition(access, businessId, orderId, "reopen", parseInput(orderVersionActionSchema, raw).version)
export const cancelOrder = (access: AccessContext, businessId: string, orderId: string, raw: unknown) => transition(access, businessId, orderId, "cancel", parseInput(orderVersionActionSchema, raw).version)
export const acceptOrder = (access: AccessContext, businessId: string, orderId: string, raw: unknown) => transition(access, businessId, orderId, "accept", parseInput(orderVersionActionSchema, raw).version)
export function rejectOrder(access: AccessContext, businessId: string, orderId: string, raw: unknown) {
    const input = parseInput(orderRejectSchema, raw)
    return transition(access, businessId, orderId, "reject", input.version, { reason: input.reason ?? null })
}

/**
 * Decisão (prestador ou cliente pelo link), dentro da transação: grava a decisão com a cópia
 * imutável da versão atual e, no aceite, cria o Trabalho na coluna Abertura. O filtro por
 * `status: "sent"` torna a decisão atômica (duas decisões simultâneas: só a primeira vale).
 */
export async function applyDecision(
    session: ClientSession,
    doc: OrderDoc,
    decision: Omit<OrderDecisionRecord, "at" | "versionNumber" | "snapshot">,
    audit: (action: string, before: unknown, after: unknown) => Promise<void>,
): Promise<{ workId: string | null }> {
    const last = await latestVersion(doc._id.toString(), session)
    const snapshot = snapshotOf(doc)
    const record: OrderDecisionRecord = { ...decision, at: new Date(), versionNumber: last?.number ?? null, snapshot }
    const accepted = decision.kind === "accept"
    const workId = accepted ? new Types.ObjectId() : null
    const updated = await orderModels().orders.updateOne(
        { _id: doc._id, status: "sent", version: doc.version ?? 0 },
        { $set: { status: accepted ? "accepted" : "rejected", ...(workId ? { workId: workId.toString() } : {}) }, $push: { decisions: record }, $inc: { version: 1 } },
        { session },
    )
    if (!updated.modifiedCount) throw new DomainError(409, "O pedido já foi decidido ou mudou. Recarregue a página.", "ORDER_ALREADY_DECIDED")
    const code = doc.code
    await audit(`${ORDER_AUDIT}.${decision.kind}`, { businessId: doc.businessId, code, status: "sent" }, { businessId: doc.businessId, code, status: accepted ? "accepted" : "rejected", by: decision.by, name: decision.name, reason: decision.reason, ip: decision.ip, versionNumber: record.versionNumber })
    if (workId) {
        const actorId = decision.actorId ?? "client:link"
        await workModels().works.create(
            [
                {
                    _id: workId,
                    businessId: doc.businessId,
                    ownerId: doc.ownerId,
                    orderId: doc._id.toString(),
                    clientId: doc.clientId,
                    code,
                    column: "opening",
                    position: Date.now(),
                    estimatedMinutes: totalMinutes(doc.items ?? []),
                    totalCents: orderTotalCents(doc),
                    currency: doc.currency,
                    dueDate: doc.dueDate ?? null,
                    loggedMinutes: 0,
                    payment: null,
                    payments: [],
                    attachments: [],
                    successId: null,
                    status: "active",
                    archivedAt: null,
                    version: 0,
                    createdBy: actorId,
                    updatedBy: null,
                },
            ],
            { session },
        )
        await workModels().moves.create([{ workId: workId.toString(), businessId: doc.businessId, from: null, to: "opening", actorId, simulation: null }], { session })
        await audit("business.work.create", null, { businessId: doc.businessId, orderId: doc._id.toString(), code, column: "opening", by: decision.by })
    }
    return { workId: workId?.toString() ?? null }
}

/** "Gerar novamente" o título/resumo por IA (o que é manual não muda). */
export async function regenerateOrderTitle(access: AccessContext, businessId: string, orderId: string): Promise<OrderDto> {
    let ownerId = ""
    await writeItem(access, businessId, "orders", async ({ current, session, ownerId: owner }) => {
        ownerId = owner
        const doc = await loadOrder(businessId, orderId, session)
        if (!needsAi(doc)) throw new DomainError(409, "Título e resumo foram definidos manualmente: apague um deles para a IA gerar.", "ORDER_TITLE_MANUAL")
        if (!canOrderTransition(doc.status, "edit")) throw invalidTransition(doc.status, "edit")
        await orderModels().orders.updateOne({ _id: doc._id }, { $set: { aiStatus: "pending", aiError: null } }, { session })
        await auditBusiness(current, `${ORDER_AUDIT}.title`, orderId, null, { businessId, code: doc.code, action: "regenerate" }, session)
        return { result: undefined }
    })
    await afterWrite(ownerId, businessId, [])
    scheduleTitle(orderId)
    return getOrder(access, businessId, orderId)
}
