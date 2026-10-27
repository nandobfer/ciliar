import { normalizeTimeZone, todayKeyIn } from "@/lib/timezone"
import { addDaysToKey, daysBetweenKeys } from "@/features/orders/logic"
import type { CalendarView } from "./constants"

/**
 * Datas do Calendário (módulo PURO). Os prazos são chaves `AAAA-MM-DD`; as horas são calculadas no
 * fuso do usuário com `Intl` (sem biblioteca de fuso): `localToInstant` converte "dia + minuto do dia"
 * em instante, inclusive na virada do horário de verão.
 */

export { addDaysToKey, daysBetweenKeys }

export const MINUTE_MS = 60 * 1000
export const DAY_MINUTES = 24 * 60

const partsCache = new Map<string, Intl.DateTimeFormat>()
function formatter(timeZone: string): Intl.DateTimeFormat {
    let value = partsCache.get(timeZone)
    if (!value) {
        value = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
        partsCache.set(timeZone, value)
    }
    return value
}

/** Diferença (ms) entre a hora local no fuso e o UTC naquele instante. */
export function zoneOffsetMs(instant: number, timeZone: string): number {
    const parts = formatter(normalizeTimeZone(timeZone)).formatToParts(new Date(instant))
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"))
    return asUtc - Math.floor(instant / 1000) * 1000
}

const keyUtc = (key: string) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)))

/** Instante do minuto `minuteOfDay` (0–1440) do dia `key` no fuso. */
export function localToInstant(key: string, minuteOfDay: number, timeZone: string): number {
    const guess = keyUtc(key) + minuteOfDay * MINUTE_MS
    const first = guess - zoneOffsetMs(guess, timeZone)
    return guess - zoneOffsetMs(first, timeZone)
}

export const dayStart = (key: string, timeZone: string) => localToInstant(key, 0, timeZone)
/** Fim exclusivo do dia (início do dia seguinte). */
export const dayEnd = (key: string, timeZone: string) => localToInstant(addDaysToKey(key, 1), 0, timeZone)

export const dayKeyOf = (instant: number, timeZone: string) => todayKeyIn(timeZone, new Date(instant))

/** Minuto do dia (0–1439) do instante no fuso. */
export function minuteOfDay(instant: number, timeZone: string): number {
    const local = instant + zoneOffsetMs(instant, timeZone)
    return Math.floor((((local % 86_400_000) + 86_400_000) % 86_400_000) / MINUTE_MS)
}

/** Dia da semana (0 = domingo) da chave. */
export const weekdayOfKey = (key: string) => new Date(keyUtc(key)).getUTCDay()

/** `"HH:mm"` → minutos do dia. */
export function hmToMinutes(value: string): number {
    const [hours, minutes] = value.split(":").map(Number)
    return (hours ?? 0) * 60 + (minutes ?? 0)
}

export function eachDayKey(from: string, to: string): string[] {
    const out: string[] = []
    for (let key = from; key <= to; key = addDaysToKey(key, 1)) out.push(key)
    return out
}

/** Dias visíveis da visão (a semana começa no domingo; o mês completa as semanas da grade). */
export function rangeOfView(view: CalendarView, anchor: string): { from: string; to: string } {
    if (view === "day") return { from: anchor, to: anchor }
    if (view === "week") {
        const from = addDaysToKey(anchor, -weekdayOfKey(anchor))
        return { from, to: addDaysToKey(from, 6) }
    }
    const first = `${anchor.slice(0, 7)}-01`
    const from = addDaysToKey(first, -weekdayOfKey(first))
    const nextMonth = addDaysToKey(first, 32).slice(0, 7)
    const last = addDaysToKey(`${nextMonth}-01`, -1)
    const to = addDaysToKey(last, 6 - weekdayOfKey(last))
    return { from, to }
}

/** Próxima âncora (◀ ▶) pela visão. */
export function shiftAnchor(view: CalendarView, anchor: string, direction: -1 | 1): string {
    if (view === "day") return addDaysToKey(anchor, direction)
    if (view === "week") return addDaysToKey(anchor, 7 * direction)
    const year = Number(anchor.slice(0, 4))
    const month = Number(anchor.slice(5, 7)) - 1 + direction
    const date = new Date(Date.UTC(year, month, 1))
    return date.toISOString().slice(0, 10)
}

export const isDateKey = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(keyUtc(value)) && new Date(keyUtc(value)).toISOString().slice(0, 10) === value
