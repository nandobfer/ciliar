import { BUSINESS_TYPE_LABELS, WEEKDAY_LABELS, type BusinessField, type BusinessType } from "./constants"

/** Formatação dos valores dos campos do Negócio (módulo puro: tela, servidor e contexto do agente). */

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

export function formatMoney(cents: number, currency: string): string {
    try {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100)
    } catch {
        return `${currency} ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    }
}

const monthLabel = (key: string) => {
    const [year, month] = key.split("-")
    return `${MONTHS[Number(month) - 1] ?? month}/${year}`
}
const dateLabel = (key: string) => key.split("-").reverse().join("/")

export interface GoalLike {
    name?: string | null
    targetCents: number
    period: "hour" | "month" | "year"
    measure?: "month" | "year" | "range" | null
    mode?: "recurring" | "specific" | null
    month?: string | null
    year?: number | null
    from?: string | null
    to?: string | null
}

function windowLabel(base: "month" | "year" | "range", goal: GoalLike): string {
    if (base === "range") return `de ${dateLabel(goal.from ?? "")} a ${dateLabel(goal.to ?? "")}`
    if (goal.mode === "specific") return base === "month" ? `em ${monthLabel(goal.month ?? "")}` : `em ${goal.year}`
    return base === "month" ? "todo mês" : "todo ano"
}

export function describeGoal(goal: GoalLike, currency = "BRL"): string {
    const value = formatMoney(goal.targetCents, currency)
    const label = goal.name ? `${goal.name}: ` : ""
    if (goal.period === "hour") return `${label}${value}/hora em média (${goal.measure ? windowLabel(goal.measure, goal) : "?"})`
    return `${label}${value} ${windowLabel(goal.period, goal)}`
}

export function describeAvailability(days: readonly { weekday: number; start?: string | null; end?: string | null }[]): string {
    return days.map((day) => `${WEEKDAY_LABELS[day.weekday] ?? day.weekday}${day.start && day.end ? ` ${day.start}–${day.end}` : ""}`).join(", ")
}

/** Texto curto do valor coletado na entrevista (painel de progresso e contexto do agente). */
export function formatFieldValue(field: BusinessField, value: unknown, currency = "BRL"): string {
    if (value === null || value === undefined) return ""
    switch (field) {
        case "type":
            return `${value as string} — ${BUSINESS_TYPE_LABELS[value as BusinessType] ?? ""}`.trim()
        case "links":
            return (value as string[]).join(", ")
        case "availability":
            return describeAvailability(value as { weekday: number; start: string | null; end: string | null }[])
        case "goals":
            return (value as GoalLike[]).map((goal) => describeGoal(goal, currency)).join("; ")
        case "logo":
            return (value as { name?: string }).name ?? "Imagem enviada"
        default:
            return String(value)
    }
}
