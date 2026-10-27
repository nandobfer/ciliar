import type { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { todayKeyIn } from "@/lib/timezone"
import { resolveAccess } from "@/features/access/server/access"
import { auditBusiness } from "@/features/businesses/server/access"
import { quoteExpired } from "@/features/orders/logic"
import { orderModels } from "@/features/orders/server/models"
import type { OrderDoc } from "@/features/orders/server/order-dto"
import { updateOrder } from "@/features/orders/server/orders"
import type { WorkDoc } from "@/features/works/server/core"
import { workModels } from "@/features/works/server/models"
import { updateWork } from "@/features/works/server/works"
import { CALENDAR_AUDIT } from "../../constants"
import { dueDateFromGoogle, pushedHash } from "../../events"
import { dayKeyOf, isDateKey } from "../../time"
import { calendarModels, type GoogleLinkRecord } from "../models"
import { calendarApi, GoogleApiError, type GoogleEvent } from "./client"
import { accessTokenOf, inBackoff, loadConnection, publishCalendarChanged, recordGoogleFailure, recordGoogleSuccess, type ConnectionDoc } from "./connection"

/**
 * Do Google para o Ciliar (CIL-4) — SOMENTE servidor. Sincronização incremental (`syncToken`) da
 * agenda de publicação, disparada pela notificação push, pela rotina `calendar-google-sync` e por
 * "Sincronizar agora".
 *
 * - Mover a data de um evento do Ciliar muda o prazo do trabalho (W1) ou do pedido aberto (D3), com
 *   o dono como ator e um registro `calendar.google.apply` (origem `google`). O fim do evento de
 *   período vira o prazo; a mudança de início é corrigida de volta.
 * - Excluir o evento só desfaz o vínculo. Eventos criados à mão não são importados.
 * - Data inválida, item encerrado (pedido aceito/cancelado/recusado/expirado, trabalho arquivado ou
 *   excluído) ou ação recusada: a data é corrigida de volta.
 * - O eco da própria publicação é ignorado pelo `etag` e pelo hash do que foi publicado (sem ciclo).
 */

type LinkDoc = GoogleLinkRecord & { _id: Types.ObjectId }

const log = loggerFor({ module: "calendar.google" })
const RETRIES = 3

export interface SyncResult {
    applied: number
    unlinked: number
    corrected: number
    errors: number
}

/** Conflito de versão: relê e tenta de novo (no mesmo campo, vale a última mudança). */
async function withRetry(action: () => Promise<unknown>): Promise<boolean> {
    for (let attempt = 0; attempt < RETRIES; attempt += 1) {
        try {
            await action()
            return true
        } catch (error) {
            if (error instanceof DomainError && error.code === "VERSION_CONFLICT") continue
            log.info({ code: error instanceof DomainError ? error.code : "error" }, "[calendar] Mudança do Google recusada: a data volta")
            return false
        }
    }
    return false
}

/** Aplica o novo prazo como o dono (sem simulação), com o fuso guardado na conexão. */
async function applyDueDate(connection: ConnectionDoc, link: LinkDoc, dueDate: string): Promise<"applied" | "corrected" | "same"> {
    const access = await resolveAccess(connection.ownerId, "none")
    access.timeZone = connection.timeZone
    if (link.kind === "order-deadline") {
        const order = await orderModels().orders.findOne({ _id: link.refId }).lean<OrderDoc>()
        if (!order) return "corrected"
        if ((order.dueDate ?? null) === dueDate) return "same"
        const expired = order.status === "sent" && order.link ? quoteExpired(order.link.validUntil, todayKeyIn(order.link.timeZone ?? connection.timeZone)) : false
        if (!["draft", "sent"].includes(order.status) || expired) return "corrected"
        const before = order.dueDate ?? null
        const ok = await withRetry(async () => {
            const fresh = await orderModels().orders.findOne({ _id: link.refId }).select({ version: 1 }).lean()
            await updateOrder(access, order.businessId, link.refId, { dueDate, version: fresh?.version ?? 0 })
        })
        if (!ok) return "corrected"
        await auditBusiness(access, `${CALENDAR_AUDIT}.apply`, link.refId, { kind: link.kind, businessId: order.businessId, code: order.code, dueDate: before }, { kind: link.kind, businessId: order.businessId, code: order.code, dueDate, source: "google" })
        return "applied"
    }
    const work = await workModels().works.findOne({ _id: link.refId }).lean<WorkDoc>()
    if (!work || work.status !== "active") return "corrected"
    if ((work.dueDate ?? null) === dueDate) return "same"
    const before = work.dueDate ?? null
    const ok = await withRetry(async () => {
        const fresh = await workModels().works.findOne({ _id: link.refId }).select({ version: 1 }).lean()
        await updateWork(access, work.businessId, link.refId, { dueDate, version: fresh?.version ?? 0 })
    })
    if (!ok) return "corrected"
    await auditBusiness(access, `${CALENDAR_AUDIT}.apply`, link.refId, { kind: link.kind, businessId: work.businessId, code: work.code, dueDate: before }, { kind: link.kind, businessId: work.businessId, code: work.code, dueDate, source: "google" })
    return "applied"
}

/** Um evento alterado na agenda de publicação. */
export async function handleIncomingEvent(connection: ConnectionDoc, event: GoogleEvent): Promise<keyof SyncResult | "ignored"> {
    const links = calendarModels().links
    const calendarId = connection.publishCalendar?.id
    const linkId = event.extendedProperties?.private?.ciliarLinkId
    const link =
        (await links.findOne({ ownerId: connection.ownerId, calendarId, eventId: event.id }).lean<LinkDoc>()) ??
        (linkId && /^[a-f\d]{24}$/i.test(linkId) ? await links.findOne({ _id: linkId, ownerId: connection.ownerId, eventId: event.id }).lean<LinkDoc>() : null)
    // Eventos criados à mão (sem vínculo) não são importados.
    if (!link || link.status === "unlinked") return "ignored"
    if (event.status === "cancelled") {
        await links.updateOne({ _id: link._id }, { $set: { status: "unlinked", unlinkedReason: "deleted_in_google", dirty: false } })
        return "unlinked"
    }
    if (event.etag && event.etag === link.etag) return "ignored"
    const incoming = pushedHash({ summary: event.summary ?? "", description: event.description ?? "", start: { date: event.start?.date ?? event.start?.dateTime ?? "" }, end: { date: event.end?.date ?? event.end?.dateTime ?? "" } })
    if (incoming === link.pushedHash) {
        await links.updateOne({ _id: link._id }, { $set: { etag: event.etag ?? link.etag } })
        return "ignored"
    }
    const dueDate = dueDateFromGoogle(event, (iso) => dayKeyOf(Date.parse(iso) - 1, connection.timeZone))
    const outcome = dueDate && isDateKey(dueDate) ? await applyDueDate(connection, link, dueDate) : "corrected"
    // Título, descrição e início são sempre do Ciliar: reescreve (e devolve a data quando não aplicou).
    await links.updateOne({ _id: link._id }, { $set: { etag: event.etag ?? null, pushedHash: null, dirty: true, nextAttemptAt: null, attempts: 0 } })
    return outcome === "applied" ? "applied" : "corrected"
}

/** Sincronização incremental da agenda de publicação. */
export async function syncConnection(ownerId: string, options: { connection?: ConnectionDoc } = {}): Promise<SyncResult & { skipped?: boolean }> {
    const result: SyncResult = { applied: 0, unlinked: 0, corrected: 0, errors: 0 }
    const connection = options.connection ?? (await loadConnection(ownerId))
    if (!connection || connection.status !== "active" || !connection.publishCalendar || inBackoff(connection)) return { ...result, skipped: true }
    const calendarId = connection.publishCalendar.id
    let syncToken = connection.syncToken
    let nextSyncToken: string | null = null
    try {
        const token = await accessTokenOf(connection)
        let restarted = false
        let pageToken: string | undefined
        for (;;) {
            let page
            try {
                page = await calendarApi.listEvents(token, calendarId, { maxResults: "250", showDeleted: "true", ...(syncToken ? { syncToken } : {}), ...(pageToken ? { pageToken } : {}) })
            } catch (error) {
                // Token de sincronização vencido: recomeça a lista completa uma vez.
                if (error instanceof GoogleApiError && error.kind === "gone" && !restarted) {
                    restarted = true
                    syncToken = null
                    pageToken = undefined
                    continue
                }
                throw error
            }
            for (const event of page.items ?? []) {
                try {
                    const outcome = await handleIncomingEvent(connection, event)
                    if (outcome !== "ignored") result[outcome] += 1
                } catch (error) {
                    result.errors += 1
                    log.warn({ err: error, ownerId }, "[calendar] Falha ao aplicar um evento do Google")
                }
            }
            pageToken = page.nextPageToken
            if (!pageToken) {
                nextSyncToken = page.nextSyncToken ?? null
                break
            }
        }
        await recordGoogleSuccess(connection, { syncToken: nextSyncToken, lastSyncAt: new Date() })
    } catch (error) {
        await recordGoogleFailure(connection, error, { publishCalendar: true })
        result.errors += 1
        return result
    }
    if (result.applied || result.unlinked || result.corrected) await publishCalendarChanged(ownerId)
    return result
}
