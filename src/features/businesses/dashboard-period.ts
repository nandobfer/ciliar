import { z } from "zod"
import { monthWindow, type GoalWindow } from "./goal-progress"

/**
 * Período do dashboard do negócio (módulo PURO, no padrão do `period.ts` do Opex). A opção fica no
 * navegador; o servidor calcula as datas no fuso do usuário a partir do "hoje" (`AAAA-MM-DD`), então
 * nada envelhece. Mês atual: um ponto por dia (do dia 1 até hoje); 3/6/12 meses: um ponto por mês
 * (incluindo o mês atual).
 */

export const BUSINESS_DASHBOARD_PERIODS = ["month", "3m", "6m", "12m"] as const
export type BusinessDashboardPeriod = (typeof BUSINESS_DASHBOARD_PERIODS)[number]

export const BUSINESS_DASHBOARD_PERIOD_LABELS: Record<BusinessDashboardPeriod, string> = {
    month: "Mês atual",
    "3m": "3 meses",
    "6m": "6 meses",
    "12m": "12 meses",
}

export const BUSINESS_DASHBOARD_PERIOD_STORAGE_KEY = "ciliar:business-dashboard:period:v1"
export const businessDashboardPeriodSchema = z.enum(BUSINESS_DASHBOARD_PERIODS, { error: "Período inválido" })
export const DEFAULT_BUSINESS_DASHBOARD_PERIOD: BusinessDashboardPeriod = "month"

export interface DashboardBuckets {
    granularity: "day" | "month"
    /** Intervalo inclusivo do período (`AAAA-MM-DD`). */
    from: string
    to: string
    buckets: GoalWindow[]
    /** Meses do período (o faturamento × meta mensal é sempre por mês). */
    months: GoalWindow[]
}

const pad = (value: number) => String(value).padStart(2, "0")

function monthsBack(year: number, month: number, count: number): GoalWindow[] {
    const windows: GoalWindow[] = []
    for (let index = count - 1; index >= 0; index -= 1) {
        const total = year * 12 + (month - 1) - index
        windows.push(monthWindow(Math.floor(total / 12), (total % 12) + 1))
    }
    return windows
}

/** Opção de período → pontos do gráfico (dia ou mês) e intervalo, a partir de hoje no fuso do usuário. */
export function dashboardBuckets(period: BusinessDashboardPeriod, today: string): DashboardBuckets {
    const [year, month, day] = today.split("-").map(Number) as [number, number, number]
    if (period === "month") {
        const buckets = Array.from({ length: day }, (_, index) => {
            const key = `${year}-${pad(month)}-${pad(index + 1)}`
            return { key, label: `${pad(index + 1)}/${pad(month)}`, from: key, to: key }
        })
        return { granularity: "day", from: buckets[0]!.from, to: today, buckets, months: [monthWindow(year, month)] }
    }
    const months = monthsBack(year, month, Number(period.replace("m", "")))
    return { granularity: "month", from: months[0]!.from, to: months.at(-1)!.to, buckets: months, months }
}

const SHORT_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

/** Rótulo curto do eixo: `20/10` (dia) ou `out/26` (mês). */
export function bucketLabel(key: string): string {
    const [year, month, day] = key.split("-")
    if (day) return `${day}/${month}`
    return `${SHORT_MONTHS[Number(month) - 1]}/${year!.slice(2)}`
}
