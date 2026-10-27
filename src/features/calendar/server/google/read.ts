import type { Interval } from "../../conflict"
import { GOOGLE_READ_CACHE_MS } from "../../constants"
import { dayStart, dayKeyOf } from "../../time"
import type { CalendarEventDto } from "../../types"
import { calendarApi, type GoogleEvent } from "./client"
import { accessTokenOf, inBackoff, loadConnection, recordGoogleFailure, recordGoogleSuccess } from "./connection"

/**
 * Leitura das agendas marcadas pelo usuário (somente consulta): eventos para exibir e os "ocupados"
 * para a capacidade. Sob demanda, com cache curto por dono e período. Eventos publicados pelo próprio
 * Ciliar (`extendedProperties.private.ciliar`) ficam de fora (não contam em dobro). Falha do Google
 * devolve `error` e o resto do calendário continua.
 */

export interface GoogleReadResult {
    events: CalendarEventDto[]
    busy: Interval[]
    error: string | null
}

const cache = new Map<string, { at: number; value: GoogleReadResult }>()
/** Teto de entradas do cache em memória (processo persistente): a mais antiga sai primeiro. */
export const GOOGLE_READ_CACHE_MAX = 200

/** Grava no cache descartando as entradas vencidas e, acima do teto, as mais antigas (o Map mantém a ordem de inserção). */
function storeGoogleRead(key: string, value: GoogleReadResult, now = Date.now()) {
    for (const [existing, entry] of cache) if (now - entry.at >= GOOGLE_READ_CACHE_MS) cache.delete(existing)
    cache.delete(key)
    cache.set(key, { at: now, value })
    while (cache.size > GOOGLE_READ_CACHE_MAX) cache.delete(cache.keys().next().value!)
}

/** Tamanho atual do cache (diagnóstico e testes). */
export const googleReadCacheSize = () => cache.size

export function clearGoogleReadCache(ownerId?: string): void {
    if (!ownerId) return cache.clear()
    for (const key of cache.keys()) if (key.startsWith(`${ownerId}|`)) cache.delete(key)
}

const EMPTY: GoogleReadResult = { events: [], busy: [], error: null }

/** Evento "ocupado": opaco, não cancelado e não recusado pelo próprio usuário. */
export function isBusyEvent(event: GoogleEvent): boolean {
    if (event.status === "cancelled" || event.transparency === "transparent") return false
    const self = event.attendees?.find((attendee) => attendee.self)
    return self?.responseStatus !== "declined"
}

/** Intervalo do evento em ms (dia inteiro no fuso do usuário; com hora, convertido pelo ISO). */
export function eventInterval(event: GoogleEvent, timeZone: string): Interval | null {
    if (event.start?.date && event.end?.date) return [dayStart(event.start.date, timeZone), dayStart(event.end.date, timeZone)]
    if (event.start?.dateTime && event.end?.dateTime) {
        const start = Date.parse(event.start.dateTime)
        const end = Date.parse(event.end.dateTime)
        return Number.isFinite(start) && Number.isFinite(end) && end > start ? [start, end] : null
    }
    return null
}

const HOUR_MS = 3_600_000

/**
 * Janela normalizada para a hora cheia (início para baixo, fim para cima): os chamadores passam `now`
 * cru, e sem isso a chave do cache mudaria a cada milissegundo. A janela maior é segura — a ocupação é
 * recortada pelo expediente entre agora e o prazo.
 */
export function googleReadWindow(from: number, to: number): [number, number] {
    return [Math.floor(from / HOUR_MS) * HOUR_MS, Math.ceil(to / HOUR_MS) * HOUR_MS]
}

export async function readGoogleEvents(ownerId: string, rawFrom: number, rawTo: number, timeZone: string): Promise<GoogleReadResult> {
    const [from, to] = googleReadWindow(rawFrom, rawTo)
    const connection = await loadConnection(ownerId)
    if (!connection || connection.status === "reauth" || !(connection.readCalendars ?? []).length) return EMPTY
    if (inBackoff(connection)) return { ...EMPTY, error: connection.lastError ?? "Google Agenda em espera pela cota." }
    const key = `${ownerId}|${from}|${to}|${timeZone}|${connection.readCalendars.map((calendar) => calendar.id).join(",")}`
    const cached = cache.get(key)
    if (cached && Date.now() - cached.at < GOOGLE_READ_CACHE_MS) return cached.value
    try {
        const token = await accessTokenOf(connection)
        const events: CalendarEventDto[] = []
        const busy: Interval[] = []
        for (const calendar of connection.readCalendars) {
            let pageToken: string | undefined
            do {
                const page = await calendarApi.listEvents(token, calendar.id, {
                    singleEvents: "true",
                    orderBy: "startTime",
                    timeMin: new Date(from).toISOString(),
                    timeMax: new Date(to).toISOString(),
                    maxResults: "250",
                    ...(pageToken ? { pageToken } : {}),
                })
                for (const item of page.items ?? []) {
                    if (item.status === "cancelled" || item.extendedProperties?.private?.ciliar === "1") continue
                    const interval = eventInterval(item, timeZone)
                    if (!interval) continue
                    const allDay = Boolean(item.start?.date)
                    const isBusy = isBusyEvent(item)
                    if (isBusy) busy.push(interval)
                    events.push({
                        id: `google:${calendar.id}:${item.id}`,
                        kind: "google",
                        businessId: null,
                        businessName: null,
                        color: calendar.color ?? "#6b7280",
                        title: item.summary?.trim() || "(Sem título)",
                        subtitle: calendar.name,
                        allDay,
                        start: allDay ? item.start!.date! : new Date(interval[0]).toISOString(),
                        // Dia inteiro: o fim do Google é exclusivo; aqui o fim é inclusivo.
                        end: allDay ? dayKeyOf(interval[1] - 1, timeZone) : new Date(interval[1]).toISOString(),
                        workId: null,
                        orderId: null,
                        code: null,
                        statusLabel: isBusy ? "Ocupado" : "Livre",
                        orderStatus: null,
                        column: null,
                        deadlineLabel: null,
                        deadlineOverdue: false,
                        conflict: null,
                        draggable: false,
                        version: null,
                        minutes: null,
                        details: null,
                        google: { calendarId: calendar.id, calendarName: calendar.name, htmlLink: item.htmlLink ?? null, busy: isBusy },
                        googleLink: null,
                    })
                }
                pageToken = page.nextPageToken
            } while (pageToken)
        }
        await recordGoogleSuccess(connection)
        const value = { events, busy, error: null }
        storeGoogleRead(key, value)
        return value
    } catch (error) {
        return { ...EMPTY, error: await recordGoogleFailure(connection, error) }
    }
}
