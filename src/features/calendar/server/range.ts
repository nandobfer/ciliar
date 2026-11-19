import { parseInput } from "@/features/access/server/commands"
import { dbConnect } from "@/lib/db"
import { normalizeTimeZone } from "@/lib/timezone"
import type { AccessContext } from "@/features/access/server/context"
import { businessOwnerOf, canBusiness, canSupportBusinesses, canUseModule, ensureBusinessCollections, requireModuleRead } from "@/features/businesses/server/access"
import { readBusiness } from "@/features/businesses/server/items"
import { ORDER_STATUS_LABELS } from "@/features/orders/constants"
import { deadlineAlert, deadlineAlertLabel, displayOrderTitle, quoteExpired, totalMinutes } from "@/features/orders/logic"
import { orderModels } from "@/features/orders/server/models"
import type { OrderDoc } from "@/features/orders/server/order-dto"
import { WORK_COLUMN_LABELS, isFixedWorkColumn } from "@/features/works/constants"
import { workDeadlineAlert } from "@/features/works/logic"
import { workModels } from "@/features/works/server/models"
import { deadlineConflict, hasAvailability, mergeIntervals, type Interval } from "../conflict"
import type { CalendarEventKind } from "../constants"
import { calendarRangeQuerySchema } from "../schemas"
import { dayEnd, dayKeyOf, dayStart, eachDayKey, hmToMinutes, DAY_MINUTES, weekdayOfKey } from "../time"
import type { CalendarBusinessDto, CalendarEventDto, CalendarRangeDto } from "../types"
import { calendarModels } from "./models"
import { connectionDto } from "./google/connection"
import { readGoogleEvents } from "./google/read"
import { acceptanceKey, alertDaysOf, availabilitiesOf, businessColor, conflictWorksOf, inProgress, loadOwnerScope, workTitle, type OwnerScope } from "./scope"

/**
 * Leitura do Calendário (CIL-4) — SOMENTE servidor. Eventos derivados na leitura: prazos e períodos dos
 * trabalhos em andamento, prazos dos pedidos abertos (Rascunho/Enviado), horas apontadas por dia e os
 * eventos das agendas Google lidas. Cada tipo respeita a visualização do módulo (`works.view`,
 * `orders.view`); o suporte (`businesses.view_all`) lê um negócio de outro usuário, auditado, sem
 * Google. Escopo do dono efetivo (`businessOwnerOf`); a capacidade sempre considera todos os negócios
 * ativos, mesmo na aba de um negócio.
 */

export interface CalendarReadScope {
    ownerId: string
    own: boolean
    businessId: string | null
    canWorks: boolean
    canOrders: boolean
}

/** Quem lê o calendário e de quem (`businessId` = aba do negócio; sem ele, o dono efetivo). */
export async function calendarReadScope(access: AccessContext, businessId: string | null | undefined): Promise<CalendarReadScope> {
    await dbConnect()
    await ensureBusinessCollections()
    if (businessId) {
        const { business, own } = await readBusiness(access, businessId, "calendar")
        const support = !own
        return {
            ownerId: business.ownerId,
            own,
            businessId,
            canWorks: support ? canSupportBusinesses(access) : canUseModule(access, "works"),
            canOrders: support ? canSupportBusinesses(access) : canUseModule(access, "orders"),
        }
    }
    requireModuleRead(access, "calendar")
    return { ownerId: businessOwnerOf(access), own: true, businessId: null, canWorks: canUseModule(access, "works") || canSupportBusinesses(access), canOrders: canUseModule(access, "orders") || canSupportBusinesses(access) }
}

/** Expediente do dia (minutos do dia), união dos negócios. Dia sem janela = dia inteiro. */
export function dayWindows(scope: Pick<OwnerScope, "businesses">, key: string): [number, number][] {
    const weekday = weekdayOfKey(key)
    const raw: Interval[] = []
    for (const business of scope.businesses) {
        for (const day of business.availability ?? []) {
            if (day.weekday !== weekday) continue
            raw.push([day.start ? hmToMinutes(day.start) : 0, day.end ? hmToMinutes(day.end) : DAY_MINUTES])
        }
    }
    return mergeIntervals(raw).map(([start, end]) => [start, end])
}

const base = (): Omit<CalendarEventDto, "id" | "kind" | "title" | "start" | "end" | "allDay" | "color"> => ({
    businessId: null,
    businessName: null,
    subtitle: null,
    workId: null,
    orderId: null,
    code: null,
    statusLabel: null,
    orderStatus: null,
    column: null,
    deadlineLabel: null,
    deadlineOverdue: false,
    conflict: null,
    draggable: false,
    version: null,
    minutes: null,
    details: null,
    google: null,
    googleLink: null,
})

const STRONGER = { info: 1, strong: 2 } as const
function markDay(conflicts: Record<string, "info" | "strong">, key: string, level: "info" | "strong") {
    const current = conflicts[key]
    if (!current || STRONGER[level] > STRONGER[current]) conflicts[key] = level
}

export async function listCalendarEvents(access: AccessContext, raw: unknown): Promise<CalendarRangeDto> {
    const query = parseInput(calendarRangeQuerySchema, raw)
    const read = await calendarReadScope(access, query.businessId)
    const timeZone = normalizeTimeZone(access.timeZone)
    const now = Date.now()
    const today = dayKeyOf(now, timeZone)
    const scope = await loadOwnerScope(read.ownerId, timeZone)
    const types = new Set<CalendarEventKind>(query.types)
    const visibleBusiness = (id: string) => scope.businessById.has(id) && (!read.businessId || read.businessId === id)
    const events: CalendarEventDto[] = []
    const conflicts: Record<string, "info" | "strong"> = {}
    const writable = read.own

    // Google: lido da agenda do próprio dono (nunca no suporte); ocupados para a capacidade até o fim do período.
    const wantsGoogle = read.own && (types.has("google") || types.has("work-deadline") || types.has("order-deadline"))
    const googleFrom = Math.min(dayStart(query.from, timeZone), now)
    const googleTo = Math.max(dayEnd(query.to, timeZone), now)
    const google = wantsGoogle ? await readGoogleEvents(read.ownerId, googleFrom, googleTo, timeZone) : { events: [], busy: [], error: null }
    const availabilities = availabilitiesOf(scope)
    const works = conflictWorksOf(scope)
    const conflictOf = (input: { dueDate: string; estimatedMinutes: number; startKey?: string | null; selfWorkId?: string | null }) =>
        deadlineConflict({ now, timeZone, works, availabilities, busy: google.busy, ...input })

    const links = read.own ? await calendarModels().links.find({ ownerId: read.ownerId }).select({ kind: 1, refId: 1, status: 1, dirty: 1, calendarId: 1, eventId: 1 }).lean() : []
    const linkOf = (kind: string, refId: string): CalendarEventDto["googleLink"] => {
        const link = links.find((item) => item.kind === kind && item.refId === refId)
        if (!link) return null
        return { status: link.status === "unlinked" ? "unlinked" : link.dirty || !link.eventId ? "pending" : "linked", htmlLink: null }
    }

    // ── Trabalhos em andamento ────────────────────────────────────────────
    if (read.canWorks && (types.has("work-deadline") || types.has("work-period"))) {
        const editWorks = writable && canBusiness(access, "works.edit")
        const customKeys = [...new Set(scope.works.filter((work) => !isFixedWorkColumn(work.column)).map((work) => work.column))]
        const customs = customKeys.length ? await workModels().columns.find({ businessId: { $in: [...scope.businessById.keys()] }, key: { $in: customKeys } }).select({ businessId: 1, key: 1, name: 1 }).lean() : []
        const columnNameOf = (businessId: string, key: string) => (isFixedWorkColumn(key) ? WORK_COLUMN_LABELS[key] : (customs.find((column) => column.businessId === businessId && column.key === key)?.name ?? "Etapa"))
        for (const work of scope.works) {
            if (!inProgress(work) || !work.dueDate || !visibleBusiness(work.businessId)) continue
            const business = scope.businessById.get(work.businessId)!
            const id = work._id.toString()
            const order = scope.ordersOfWorks.get(work.orderId)
            const title = workTitle(work, scope)
            const startKey = acceptanceKey(work, order, timeZone)
            const columnName = columnNameOf(work.businessId, work.column)
            const common = { ...base(), businessId: work.businessId, businessName: business.name, color: businessColor(business), workId: id, orderId: work.orderId, code: work.code, column: work.column, statusLabel: columnName, version: work.version ?? 0 }
            if (types.has("work-deadline") && work.dueDate >= query.from && work.dueDate <= query.to) {
                const alert = workDeadlineAlert({ column: work.column, dueDate: work.dueDate }, today, alertDaysOf(business))
                const conflict = conflictOf({ dueDate: work.dueDate, estimatedMinutes: Math.max(0, (work.estimatedMinutes ?? 0) - (work.loggedMinutes ?? 0)), startKey, selfWorkId: id })
                const level = conflict.level === "none" ? null : conflict.level
                if (level) markDay(conflicts, work.dueDate, level)
                events.push({ ...common, id: `work-deadline:${id}`, kind: "work-deadline", title, subtitle: `Prazo · ${business.name}`, allDay: true, start: work.dueDate, end: work.dueDate, deadlineLabel: alert ? deadlineAlertLabel(alert) : null, deadlineOverdue: alert?.kind === "overdue", conflict: level, draggable: editWorks, googleLink: linkOf("work-deadline", id) })
            }
            if (types.has("work-period") && startKey <= query.to && work.dueDate >= query.from) {
                events.push({ ...common, id: `work-period:${id}`, kind: "work-period", title, subtitle: `Período · ${business.name}`, allDay: true, start: startKey <= work.dueDate ? startKey : work.dueDate, end: work.dueDate, googleLink: linkOf("work-period", id) })
            }
        }
    }

    // ── Pedidos abertos (Rascunho e Enviado) ──────────────────────────────
    if (read.canOrders && types.has("order-deadline")) {
        const businessIds = scope.businesses.map((business) => business._id.toString()).filter(visibleBusiness)
        const orders = businessIds.length
            ? await orderModels().orders.find({ ownerId: read.ownerId, businessId: { $in: businessIds }, status: { $in: ["draft", "sent"] }, dueDate: { $gte: query.from, $lte: query.to } }).lean<OrderDoc[]>()
            : []
        const editOrders = writable && canBusiness(access, "orders.edit")
        for (const order of orders) {
            const business = scope.businessById.get(order.businessId)!
            const id = order._id.toString()
            const expired = order.status === "sent" && order.link ? quoteExpired(order.link.validUntil, today) : false
            const alert = deadlineAlert(order.dueDate, today, alertDaysOf(business))
            const conflict = conflictOf({ dueDate: order.dueDate!, estimatedMinutes: totalMinutes(order.items ?? []) })
            const level = conflict.level === "none" ? null : conflict.level
            if (level) markDay(conflicts, order.dueDate!, level)
            events.push({
                ...base(),
                id: `order-deadline:${id}`,
                kind: "order-deadline",
                businessId: order.businessId,
                businessName: business.name,
                color: businessColor(business),
                title: displayOrderTitle(order),
                subtitle: `Prazo do pedido · ${business.name}`,
                allDay: true,
                start: order.dueDate!,
                end: order.dueDate!,
                orderId: id,
                code: order.code,
                orderStatus: order.status,
                statusLabel: expired ? "Enviado (link expirado)" : ORDER_STATUS_LABELS[order.status],
                deadlineLabel: alert ? deadlineAlertLabel(alert) : null,
                deadlineOverdue: alert?.kind === "overdue",
                conflict: level,
                draggable: editOrders,
                version: order.version ?? 0,
                googleLink: linkOf("order-deadline", id),
            })
        }
    }

    // ── Horas apontadas (total do dia, detalhe por trabalho) ──────────────
    if (read.canWorks && types.has("logged-hours")) {
        const businessIds = scope.businesses.map((business) => business._id.toString()).filter(visibleBusiness)
        const entries = businessIds.length ? await workModels().timeEntries.find({ ownerId: read.ownerId, businessId: { $in: businessIds }, date: { $gte: query.from, $lte: query.to } }).select({ workId: 1, businessId: 1, date: 1, minutes: 1 }).lean() : []
        const workIds = [...new Set(entries.map((entry) => entry.workId))]
        const known = new Map(scope.works.map((work) => [work._id.toString(), work]))
        const missing = workIds.filter((id) => !known.has(id))
        const extra = missing.length ? await workModels().works.find({ _id: { $in: missing } }).select({ code: 1, orderId: 1, businessId: 1 }).lean() : []
        const extraOrders = extra.length ? await orderModels().orders.find({ _id: { $in: extra.map((work) => work.orderId) } }).select({ title: 1, description: 1 }).lean<OrderDoc[]>() : []
        const titleOf = (workId: string): { code: string; title: string } => {
            const work = known.get(workId)
            if (work) return { code: work.code, title: workTitle(work, scope) }
            const other = extra.find((item) => String(item._id) === workId)
            const order = other ? extraOrders.find((item) => item._id.toString() === other.orderId) : undefined
            return { code: other?.code ?? "—", title: order ? displayOrderTitle(order) : (other?.code ?? "Trabalho excluído") }
        }
        const byDay = new Map<string, Map<string, { businessId: string; minutes: number }>>()
        for (const entry of entries) {
            const day = byDay.get(entry.date) ?? new Map()
            const current = day.get(entry.workId) ?? { businessId: entry.businessId, minutes: 0 }
            current.minutes += entry.minutes
            day.set(entry.workId, current)
            byDay.set(entry.date, day)
        }
        for (const [date, perWork] of byDay) {
            const details = [...perWork.entries()].map(([workId, value]) => ({ workId, businessId: value.businessId, ...titleOf(workId), minutes: value.minutes }))
            const minutes = details.reduce((sum, item) => sum + item.minutes, 0)
            const single = read.businessId ? scope.businessById.get(read.businessId) : details.length && details.every((item) => item.businessId === details[0]!.businessId) ? scope.businessById.get(details[0]!.businessId) : undefined
            events.push({ ...base(), id: `logged-hours:${date}`, kind: "logged-hours", businessId: single?._id.toString() ?? null, businessName: single?.name ?? null, color: single ? businessColor(single) : "#64748b", title: "Horas apontadas", allDay: true, start: date, end: date, minutes, details })
        }
    }

    if (types.has("google")) events.push(...google.events.filter((event) => (event.allDay ? event.end >= query.from && event.start <= query.to : Date.parse(event.end) > dayStart(query.from, timeZone) && Date.parse(event.start) < dayEnd(query.to, timeZone))))

    const businesses: CalendarBusinessDto[] = scope.businesses
        .filter((business) => !read.businessId || business._id.toString() === read.businessId)
        .map((business) => ({
            id: business._id.toString(),
            name: business.name,
            color: businessColor(business),
            canCreateOrders: writable && canBusiness(access, "orders.edit"),
            canEditOrders: writable && canBusiness(access, "orders.edit"),
            canEditWorks: writable && canBusiness(access, "works.edit"),
        }))

    return {
        from: query.from,
        to: query.to,
        timeZone,
        events,
        availability: eachDayKey(query.from, query.to).map((date) => ({ date, windows: dayWindows(scope, date) })),
        noAvailability: !hasAvailability(availabilities),
        conflicts,
        businesses,
        google: read.own ? await connectionDto(read.ownerId) : null,
        googleError: google.error,
        own: read.own,
    }
}
