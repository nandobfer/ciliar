import type { GoalLike } from "./format"

/**
 * Progresso das metas (módulo PURO). Janelas de medição por data (`AAAA-MM-DD`, inclusivas) no fuso
 * do usuário: mês/ano recorrente (janela corrente + histórico desde a criação), mês/ano específico,
 * meta por hora com janela mês/ano ou intervalo de datas.
 *
 * Faturamento bruto = soma dos valores recebidos dos trabalhos em Pago (não arquivados) pela data do
 * pagamento (M4). Meta por hora = faturamento ÷ horas apontadas; sem horas, indisponível.
 */

export interface GoalWindow {
    key: string
    label: string
    from: string
    to: string
}

export type GoalProgressStatus = "active" | "upcoming" | "ended"

export interface GoalMeasurement {
    revenueCents: number
    /** Minutos apontados (realizados) nos trabalhos pagos da janela. */
    minutes: number
}

export interface GoalWindowProgress extends GoalWindow {
    revenueCents: number
    minutes: number
    /** Atingido: faturamento (mês/ano) ou valor médio por hora; `null` = indisponível (sem horas). */
    achievedCents: number | null
    percent: number | null
    available: boolean
}

export interface GoalProgress {
    status: GoalProgressStatus
    current: GoalWindowProgress | null
    history: GoalWindowProgress[]
}

export const GOAL_HISTORY_MAX = 12

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
const pad = (value: number) => String(value).padStart(2, "0")
const dateLabel = (key: string) => key.split("-").reverse().join("/")

function lastDay(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function monthWindow(year: number, month: number): GoalWindow {
    return { key: `${year}-${pad(month)}`, label: `${MONTHS[month - 1]}/${year}`, from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay(year, month))}` }
}

export function yearWindow(year: number): GoalWindow {
    return { key: String(year), label: String(year), from: `${year}-01-01`, to: `${year}-12-31` }
}

export function rangeWindow(from: string, to: string): GoalWindow {
    return { key: `${from}_${to}`, label: `${dateLabel(from)} a ${dateLabel(to)}`, from, to }
}

const parts = (key: string) => key.split("-").map(Number) as [number, number, number]

function statusOf(window: GoalWindow, today: string): GoalProgressStatus {
    if (today < window.from) return "upcoming"
    if (today > window.to) return "ended"
    return "active"
}

/**
 * Janelas da meta: a corrente (ou a única, nas específicas/intervalo) e o histórico das recorrentes
 * (mais recente primeiro, desde a criação, no máximo `GOAL_HISTORY_MAX`).
 */
export function goalWindows(goal: GoalLike, today: string, createdOn: string = today): { status: GoalProgressStatus; current: GoalWindow; history: GoalWindow[] } {
    const base = goal.period === "hour" ? (goal.measure ?? "month") : goal.period
    const [year, month] = parts(today)
    const [createdYear, createdMonth] = parts(createdOn <= today ? createdOn : today)
    if (base === "range") {
        const window = rangeWindow(goal.from ?? today, goal.to ?? today)
        return { status: statusOf(window, today), current: window, history: [] }
    }
    if (base === "month") {
        if (goal.mode === "specific" && goal.month) {
            const [y, m] = goal.month.split("-").map(Number) as [number, number]
            const window = monthWindow(y, m)
            return { status: statusOf(window, today), current: window, history: [] }
        }
        const history: GoalWindow[] = []
        let y = year
        let m = month
        while (history.length < GOAL_HISTORY_MAX) {
            m -= 1
            if (m === 0) {
                m = 12
                y -= 1
            }
            if (y < createdYear || (y === createdYear && m < createdMonth)) break
            history.push(monthWindow(y, m))
        }
        return { status: "active", current: monthWindow(year, month), history }
    }
    if (goal.mode === "specific" && goal.year) {
        const window = yearWindow(goal.year)
        return { status: statusOf(window, today), current: window, history: [] }
    }
    const history: GoalWindow[] = []
    for (let y = year - 1; y >= createdYear && history.length < GOAL_HISTORY_MAX; y -= 1) history.push(yearWindow(y))
    return { status: "active", current: yearWindow(year), history }
}

/** Progresso de uma janela pela medição (faturamento e horas). */
export function windowProgress(goal: Pick<GoalLike, "period" | "targetCents">, window: GoalWindow, measurement: GoalMeasurement): GoalWindowProgress {
    const { revenueCents, minutes } = measurement
    if (goal.period === "hour") {
        if (minutes <= 0) return { ...window, revenueCents, minutes, achievedCents: null, percent: null, available: false }
        const achievedCents = Math.round(revenueCents / (minutes / 60))
        return { ...window, revenueCents, minutes, achievedCents, percent: percentOf(achievedCents, goal.targetCents), available: true }
    }
    return { ...window, revenueCents, minutes, achievedCents: revenueCents, percent: percentOf(revenueCents, goal.targetCents), available: true }
}

function percentOf(achieved: number, target: number): number {
    if (target <= 0) return 0
    return Math.round((achieved / target) * 1000) / 10
}

export const EMPTY_MEASUREMENT: GoalMeasurement = { revenueCents: 0, minutes: 0 }
