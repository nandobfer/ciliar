/**
 * Fuso horário do usuário (módulo PURO: navegador e servidor). O navegador envia o fuso em toda
 * requisição (`x-ciliar-timezone`, pelo Axios central); sem ele, ou se for inválido, vale São Paulo.
 */

export const DEFAULT_TIME_ZONE = "America/Sao_Paulo"
export const TIME_ZONE_HEADER = "x-ciliar-timezone"

/** Fuso IANA válido ou o padrão (`America/Sao_Paulo`). */
export function normalizeTimeZone(value: string | null | undefined): string {
    const candidate = value?.trim()
    if (!candidate || candidate.length > 64) return DEFAULT_TIME_ZONE
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: candidate })
        return candidate
    } catch {
        return DEFAULT_TIME_ZONE
    }
}

/** Fuso do navegador (`Intl`), ou o padrão quando indisponível. */
export function browserTimeZone(): string {
    try {
        return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
    } catch {
        return DEFAULT_TIME_ZONE
    }
}

/** Data de hoje (`AAAA-MM-DD`) no fuso informado. */
export function todayKeyIn(timeZone: string, now: Date = new Date()): string {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: normalizeTimeZone(timeZone), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now)
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ""
    return `${get("year")}-${get("month")}-${get("day")}`
}
