import { dayEnd, dayKeyOf, dayStart, MINUTE_MS } from "../time"
import type { CalendarEventDto } from "../types"

/** Disposição dos eventos nas visões (módulo puro, testável). */

export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const
export const HOUR_HEIGHT = 48

const ORDER: Record<CalendarEventDto["kind"], number> = { "work-deadline": 0, "order-deadline": 1, "logged-hours": 2, google: 3, "work-period": 4 }

/** Dias (no fuso do navegador) cobertos por um evento com hora. */
function timedDays(event: CalendarEventDto, timeZone: string): [string, string] {
    return [dayKeyOf(Date.parse(event.start), timeZone), dayKeyOf(Date.parse(event.end) - 1, timeZone)]
}

/** Eventos do dia (dia inteiro e, na visão Mês, os com hora), na ordem de exibição. */
export function eventsOfDay(events: readonly CalendarEventDto[], day: string, options: { timeZone?: string; includeTimed?: boolean } = {}): CalendarEventDto[] {
    const includeTimed = options.includeTimed ?? true
    return events
        .filter((event) => {
            if (event.allDay) return event.start <= day && event.end >= day
            if (!includeTimed || !options.timeZone) return includeTimed && event.start.slice(0, 10) <= day && event.end.slice(0, 10) >= day
            const [start, end] = timedDays(event, options.timeZone)
            return start <= day && end >= day
        })
        .sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.title.localeCompare(b.title, "pt-BR"))
}

export interface TimedPlacement {
    event: CalendarEventDto
    top: number
    height: number
    lane: number
    lanes: number
}

/** Eventos com hora do dia, posicionados na grade (minutos → px) e em faixas quando se sobrepõem. */
export function layoutTimed(events: readonly CalendarEventDto[], day: string, timeZone: string, hourHeight = HOUR_HEIGHT): TimedPlacement[] {
    const start = dayStart(day, timeZone)
    const end = dayEnd(day, timeZone)
    const items = events
        .filter((event) => !event.allDay)
        .map((event) => ({ event, from: Math.max(Date.parse(event.start), start), to: Math.min(Date.parse(event.end), end) }))
        .filter((item) => item.to > item.from)
        .sort((a, b) => a.from - b.from || b.to - a.to)
    const placed: (TimedPlacement & { from: number; to: number })[] = []
    let group: typeof placed = []
    let groupEnd = -Infinity
    const flush = () => {
        const lanes = Math.max(1, ...group.map((item) => item.lane + 1))
        for (const item of group) item.lanes = lanes
        group = []
    }
    for (const item of items) {
        if (item.from >= groupEnd) {
            flush()
            groupEnd = -Infinity
        }
        const used = new Set(group.filter((other) => other.to > item.from).map((other) => other.lane))
        let lane = 0
        while (used.has(lane)) lane += 1
        const minutes = (item.from - start) / MINUTE_MS
        const duration = Math.max(15, (item.to - item.from) / MINUTE_MS)
        const placement = { event: item.event, from: item.from, to: item.to, top: (minutes / 60) * hourHeight, height: (duration / 60) * hourHeight, lane, lanes: 1 }
        group.push(placement)
        placed.push(placement)
        groupEnd = Math.max(groupEnd, item.to)
    }
    flush()
    return placed.map(({ event, top, height, lane, lanes }) => ({ event, top, height, lane, lanes }))
}

/** Minuto do dia (0–1439) da posição vertical do ponteiro na grade, em passos de 15 min. */
export function minuteAtOffset(offsetY: number, hourHeight = HOUR_HEIGHT, step = 15): number {
    const minute = Math.floor(((offsetY / hourHeight) * 60) / step) * step
    return Math.min(24 * 60 - step, Math.max(0, minute))
}

export const hourLabel = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`

/** Lacunas (fora do expediente) de um dia, em minutos, a partir das janelas. */
export function offWindows(windows: readonly (readonly [number, number])[]): [number, number][] {
    const out: [number, number][] = []
    let cursor = 0
    for (const [start, end] of [...windows].sort((a, b) => a[0] - b[0])) {
        if (start > cursor) out.push([cursor, start])
        cursor = Math.max(cursor, end)
    }
    if (cursor < 24 * 60) out.push([cursor, 24 * 60])
    return out
}
