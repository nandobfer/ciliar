import type { Types } from "mongoose"
import { runAfterResponse } from "@/lib/after-response"
import { loggerFor } from "@/lib/logger"
import { todayKeyIn } from "@/lib/timezone"
import { appOrigin } from "@/features/auth/server/origin"
import { businessModels } from "@/features/businesses/server/models"
import { displayOrderTitle, quoteExpired, totalMinutes } from "@/features/orders/logic"
import { orderModels } from "@/features/orders/server/models"
import type { OrderDoc } from "@/features/orders/server/order-dto"
import { WORK_COLUMN_LABELS, isFixedWorkColumn } from "@/features/works/constants"
import type { WorkDoc } from "@/features/works/server/core"
import { workModels } from "@/features/works/server/models"
import type { GoogleLinkKind } from "../../constants"
import { googleEventBody, orderStatusTag, pushedHash, workStatusTag, type PublishSource } from "../../events"
import { calendarModels, type GoogleLinkRecord, type GoogleLinkSnapshot } from "../models"
import { acceptanceKey, inProgress } from "../scope"
import { calendarApi, GoogleApiError } from "./client"
import { accessTokenOf, backoffDelay, inBackoff, loadConnection, publishCalendarChanged, recordGoogleFailure, recordGoogleSuccess, type ConnectionDoc } from "./connection"

/**
 * Publicação do Ciliar no Google (CIL-4) — SOMENTE servidor. Fila em `calendar_google_links`
 * (`dirty`): os serviços de pedidos e trabalhos marcam o item depois do commit (`markCalendarDirty`) e
 * a fila roda depois da resposta e na rotina `calendar-google-sync`. Falha nunca desfaz a operação no
 * Ciliar: o vínculo fica pendente e é tentado de novo com espera crescente.
 *
 * Os eventos ficam como histórico: Pago, arquivado, excluído, aceito, cancelado, recusado ou expirado
 * só mudam o título. Evento excluído no Google desfaz o vínculo (só volta com "Republicar").
 */

type LinkDoc = GoogleLinkRecord & { _id: Types.ObjectId }

const log = loggerFor({ module: "calendar.google" })
const CLAIM_MS = 60_000

export interface CalendarRef {
    businessId: string
    workId?: string | null
    orderId?: string | null
}

function refKinds(ref: CalendarRef): [GoogleLinkKind, string][] {
    const out: [GoogleLinkKind, string][] = []
    if (ref.workId) out.push(["work-deadline", ref.workId], ["work-period", ref.workId])
    if (ref.orderId) out.push(["order-deadline", ref.orderId])
    return out
}

/**
 * Marca o item para publicar (depois do commit). Sem conexão com agenda de publicação, não faz nada.
 * Nunca lança: o Google é opcional e não pode quebrar a operação do Ciliar.
 */
export async function markCalendarDirty(ownerId: string, ref: CalendarRef, options: { run?: boolean } = {}): Promise<void> {
    try {
        const connection = await calendarModels().connections.findOne({ ownerId }).select({ publishCalendar: 1 }).lean()
        if (!connection?.publishCalendar) return
        const links = calendarModels().links
        for (const [kind, refId] of refKinds(ref)) {
            const existing = await links.findOne({ ownerId, kind, refId }).select({ status: 1, unlinkedReason: 1 }).lean()
            // Excluído no Google: só volta com "Republicar".
            if (existing?.status === "unlinked" && existing.unlinkedReason === "deleted_in_google") continue
            await links.updateOne(
                { ownerId, kind, refId },
                { $set: { dirty: true, status: "linked", unlinkedReason: null, attempts: 0, nextAttemptAt: null }, $setOnInsert: { businessId: ref.businessId, calendarId: null, eventId: null, etag: null, pushedHash: null, lastError: null, snapshot: null, claimedUntil: null } },
                { upsert: true },
            )
        }
        if (options.run !== false) runAfterResponse("calendar-publish", () => processPublishQueue(ownerId))
    } catch (error) {
        log.warn({ err: error, ownerId }, "[calendar] Não foi possível marcar o item para o Google")
    }
}

/** Todos os itens publicáveis do dono (ao escolher a agenda de publicação): trabalhos em andamento e pedidos abertos com prazo. */
export async function seedCalendarLinks(ownerId: string): Promise<number> {
    const businesses = await businessModels().businesses.find({ ownerId, status: "active" }).select({ _id: 1 }).lean()
    const ids = businesses.map((business) => String(business._id))
    if (!ids.length) return 0
    const [works, orders] = await Promise.all([
        workModels().works.find({ ownerId, businessId: { $in: ids }, status: "active", column: { $ne: "paid" }, dueDate: { $ne: null } }).select({ businessId: 1 }).lean(),
        orderModels().orders.find({ ownerId, businessId: { $in: ids }, status: { $in: ["draft", "sent"] }, dueDate: { $ne: null } }).select({ businessId: 1 }).lean(),
    ])
    const refs: [GoogleLinkKind, string, string][] = [
        ...works.flatMap((work) => [["work-deadline", String(work._id), work.businessId] as [GoogleLinkKind, string, string], ["work-period", String(work._id), work.businessId] as [GoogleLinkKind, string, string]]),
        ...orders.map((order) => ["order-deadline", String(order._id), order.businessId] as [GoogleLinkKind, string, string]),
    ]
    if (!refs.length) return 0
    const result = await calendarModels().links.bulkWrite(
        refs.map(([kind, refId, businessId]) => ({
            updateOne: {
                filter: { ownerId, kind, refId },
                update: { $setOnInsert: { ownerId, kind, refId, businessId, status: "linked", unlinkedReason: null, dirty: true, attempts: 0, nextAttemptAt: null, calendarId: null, eventId: null, etag: null, pushedHash: null, lastError: null, snapshot: null, claimedUntil: null } },
                upsert: true,
            },
        })),
    )
    return result.upsertedCount
}

const urlOf = (path: string) => {
    try {
        return `${appOrigin()}${path}`
    } catch {
        return path
    }
}

const clientName = async (clientId: string | null | undefined) => (clientId ? ((await orderModels().clients.findOne({ _id: clientId }).select({ name: 1 }).lean())?.name ?? null) : null)

type Plan = { source: PublishSource; after: "keep" | "unlink_item_deleted" | "unlink_no_due" } | { drop: true }

/** O que publicar para o vínculo agora (ou descartar quando nunca foi publicado e não há o que mostrar). */
export async function planPublication(link: LinkDoc, timeZone: string): Promise<Plan> {
    const fromSnapshot = (snapshot: GoogleLinkSnapshot, statusTag: string, after: "unlink_item_deleted" | "unlink_no_due"): Plan => ({ source: { ...snapshot, kind: link.kind, linkId: link._id.toString(), statusTag }, after })
    const business = await businessModels().businesses.findOne({ _id: link.businessId }).select({ name: 1 }).lean()
    if (link.kind === "order-deadline") {
        const order = await orderModels().orders.findOne({ _id: link.refId }).lean<OrderDoc>()
        if (!order || !business) return link.eventId && link.snapshot ? fromSnapshot(link.snapshot, "Excluído", "unlink_item_deleted") : { drop: true }
        const expired = order.status === "sent" && order.link ? quoteExpired(order.link.validUntil, todayKeyIn(order.link.timeZone ?? timeZone)) : false
        const statusTag = orderStatusTag(order.status, expired)
        if (!order.dueDate) return link.eventId && link.snapshot ? fromSnapshot(link.snapshot, "Sem prazo", "unlink_no_due") : { drop: true }
        if (!link.eventId && statusTag) return { drop: true }
        return {
            source: { kind: link.kind, linkId: link._id.toString(), code: order.code, title: displayOrderTitle(order), businessName: business.name, clientName: await clientName(order.clientId), startKey: null, dueDate: order.dueDate, statusTag, columnName: null, estimatedMinutes: totalMinutes(order.items ?? []), url: urlOf(`/negocios/${order.businessId}/pedidos/${order._id.toString()}`) },
            after: "keep",
        }
    }
    const work = await workModels().works.findOne({ _id: link.refId }).lean<WorkDoc>()
    if (!work || !business) return link.eventId && link.snapshot ? fromSnapshot(link.snapshot, "Excluído", "unlink_item_deleted") : { drop: true }
    if (!work.dueDate) return link.eventId && link.snapshot ? fromSnapshot(link.snapshot, "Sem prazo", "unlink_no_due") : { drop: true }
    const statusTag = workStatusTag(work)
    if (!link.eventId && !inProgress(work)) return { drop: true }
    const order = await orderModels().orders.findOne({ _id: work.orderId }).lean<OrderDoc>()
    const columnName = isFixedWorkColumn(work.column) ? WORK_COLUMN_LABELS[work.column] : ((await workModels().columns.findOne({ businessId: work.businessId, key: work.column }).select({ name: 1 }).lean())?.name ?? null)
    return {
        source: {
            kind: link.kind,
            linkId: link._id.toString(),
            code: work.code,
            title: order ? displayOrderTitle(order) : work.code,
            businessName: business.name,
            clientName: await clientName(work.clientId),
            startKey: acceptanceKey(work, order ?? undefined, timeZone),
            dueDate: work.dueDate,
            statusTag,
            columnName,
            estimatedMinutes: work.estimatedMinutes ?? 0,
            url: urlOf(`/negocios/${work.businessId}/trabalhos/${work._id.toString()}`),
        },
        after: "keep",
    }
}

const snapshotOf = (source: PublishSource): GoogleLinkSnapshot => ({
    code: source.code,
    title: source.title,
    businessName: source.businessName,
    clientName: source.clientName,
    startKey: source.startKey,
    dueDate: source.dueDate,
    statusTag: source.statusTag,
    columnName: source.columnName,
    estimatedMinutes: source.estimatedMinutes,
    url: source.url,
})

export interface PublishResult {
    published: number
    unlinked: number
    errors: number
    stopped: boolean
}

/** Processa a fila do dono (até `limit` vínculos). Para na cota, no token revogado e na agenda excluída. */
export async function processPublishQueue(ownerId: string, options: { limit?: number; connection?: ConnectionDoc } = {}): Promise<PublishResult> {
    const result: PublishResult = { published: 0, unlinked: 0, errors: 0, stopped: false }
    const connection = options.connection ?? (await loadConnection(ownerId))
    if (!connection || connection.status !== "active" || !connection.publishCalendar || inBackoff(connection)) return { ...result, stopped: true }
    const calendarId = connection.publishCalendar.id
    const links = calendarModels().links
    const now = new Date()
    const queue = await links
        .find({ ownerId, status: "linked", dirty: true, $and: [{ $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] }, { $or: [{ claimedUntil: null }, { claimedUntil: { $lte: now } }] }] })
        .sort({ updatedAt: 1 })
        .limit(options.limit ?? 100)
        .lean<LinkDoc[]>()
    if (!queue.length) return result
    let token: string
    try {
        token = await accessTokenOf(connection)
    } catch (error) {
        await recordGoogleFailure(connection, error)
        return { ...result, stopped: true }
    }
    for (const candidate of queue) {
        const claimed = await links.findOneAndUpdate({ _id: candidate._id, dirty: true, $or: [{ claimedUntil: null }, { claimedUntil: { $lte: new Date() } }] }, { $set: { claimedUntil: new Date(Date.now() + CLAIM_MS) } }, { returnDocument: "after" }).lean<LinkDoc>()
        if (!claimed) continue
        try {
            const plan = await planPublication(claimed, connection.timeZone)
            if ("drop" in plan) {
                await links.deleteOne({ _id: claimed._id, eventId: null })
                await links.updateOne({ _id: claimed._id }, { $set: { dirty: false, claimedUntil: null } })
                continue
            }
            const body = googleEventBody(plan.source)
            const hash = pushedHash(body)
            const sameCalendar = claimed.eventId && claimed.calendarId === calendarId
            let event: { id: string; etag?: string } | null = null
            if (sameCalendar && hash === claimed.pushedHash) event = { id: claimed.eventId!, etag: claimed.etag ?? undefined }
            else if (sameCalendar) {
                try {
                    event = await calendarApi.patchEvent(token, calendarId, claimed.eventId!, body)
                } catch (error) {
                    if (error instanceof GoogleApiError && (error.kind === "not_found" || error.kind === "gone")) {
                        // Excluído no Google: só desfaz o vínculo.
                        await links.updateOne({ _id: claimed._id }, { $set: { status: "unlinked", unlinkedReason: "deleted_in_google", dirty: false, claimedUntil: null } })
                        result.unlinked += 1
                        continue
                    }
                    throw error
                }
            } else event = await calendarApi.insertEvent(token, calendarId, body)
            const set: Record<string, unknown> = { calendarId, eventId: event.id, etag: event.etag ?? null, pushedHash: hash, snapshot: snapshotOf(plan.source), dirty: false, attempts: 0, nextAttemptAt: null, lastError: null, claimedUntil: null }
            if (plan.after !== "keep") Object.assign(set, { status: "unlinked", unlinkedReason: plan.after === "unlink_item_deleted" ? "item_deleted" : "no_due_date" })
            // Só limpa a fila se nada mudou durante o envio (senão fica pendente para a próxima rodada).
            const fresh = await links.findOne({ _id: claimed._id }).select({ updatedAt: 1, dirty: 1 }).lean()
            const changedMeanwhile = fresh && new Date(fresh.updatedAt).getTime() > new Date(claimed.updatedAt).getTime()
            if (changedMeanwhile) delete set.dirty
            await links.updateOne({ _id: claimed._id }, { $set: set })
            result.published += 1
        } catch (error) {
            const google = error instanceof GoogleApiError ? error : null
            if (google && (google.kind === "quota" || google.kind === "auth" || (google.kind === "not_found" && !claimed.eventId))) {
                await links.updateOne({ _id: claimed._id }, { $set: { claimedUntil: null } })
                await recordGoogleFailure(connection, error, { publishCalendar: true })
                result.stopped = true
                break
            }
            const attempts = (claimed.attempts ?? 0) + 1
            await links.updateOne({ _id: claimed._id }, { $set: { attempts, nextAttemptAt: new Date(Date.now() + backoffDelay(attempts)), lastError: google?.message ?? "Falha ao publicar no Google Agenda.", claimedUntil: null } })
            log.warn({ err: google ? undefined : error, ownerId, kind: claimed.kind, attempts }, "[calendar] Falha ao publicar o evento")
            result.errors += 1
        }
    }
    if (result.published && !result.stopped) await recordGoogleSuccess(connection)
    if (result.published || result.unlinked) await publishCalendarChanged(ownerId)
    return result
}
