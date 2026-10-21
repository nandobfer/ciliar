import type { Types } from "mongoose"
import { normalizeTimeZone, todayKeyIn } from "@/lib/timezone"
import type { AccessContext } from "@/features/access/server/context"
import { dashboardBuckets, DEFAULT_BUSINESS_DASHBOARD_PERIOD, type BusinessDashboardPeriod } from "../dashboard-period"
import type { GoalWindow } from "../goal-progress"
import type { BusinessDashboardDto, DashboardCategorySlice } from "../types"
import { goalsProgress, periodsOf, toGoalItemDto } from "./goals"
import { readBusiness, retentionDaysOf } from "./items"
import { businessModels, type ActivityPriceRecord, type BusinessActivityRecord, type BusinessGoalRecord } from "./models"
import { measureGoalWindows } from "./revenue"

/**
 * Dashboard do espaço do negócio (M2) — SOMENTE servidor. Indicadores, a meta atual com progresso,
 * contagens dos atalhos e as séries dos gráficos, tudo no fuso do usuário e no período escolhido.
 * Faturamento bruto vem de `measureGoalWindows` (zero até o M4: trabalhos em Pago).
 */

export const RATE_RANKING_MAX = 8
export const RATE_TREND_MAX = 5
const NO_CATEGORY = "Sem categoria"

type Lean<T> = T & { _id: Types.ObjectId }

/** Contagem por categoria (sem categoria agrupado), da maior para a menor. */
export function categorySlices(categories: readonly (string | null)[]): DashboardCategorySlice[] {
    const counts = new Map<string, number>()
    for (const category of categories) {
        const name = category?.trim() || NO_CATEGORY
        counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"))
}

/** Valor/hora de cada atividade no fim de cada ponto (último preço até o dia; `null` antes de existir). */
export function rateTrendRows(buckets: readonly GoalWindow[], activities: readonly { id: string }[], prices: readonly { activityId: string; toCents: number; day: string }[]) {
    return buckets.map((bucket) => {
        const row: Record<string, string | number | null> = { bucket: bucket.key }
        activities.forEach((activity, index) => {
            const last = prices.filter((price) => price.activityId === activity.id && price.day <= bucket.to).at(-1)
            row[`a${index}`] = last ? last.toCents : null
        })
        return row
    })
}

/**
 * A meta que valia no mês (linha do tempo): entre as que estiveram ativas em algum dia do mês, a que
 * ficou ativa por último dentro dele.
 */
export function goalActiveIn<T extends Pick<BusinessGoalRecord, "activePeriods" | "createdAt" | "status" | "supersededAt" | "archivedAt" | "updatedAt">>(goals: readonly T[], month: GoalWindow, timeZone: string, now: Date = new Date()): T | null {
    let best: { goal: T; end: string; start: string } | null = null
    for (const goal of goals) {
        for (const period of periodsOf(goal)) {
            const from = todayKeyIn(timeZone, period.from)
            const to = todayKeyIn(timeZone, period.to ?? now)
            if (from > month.to || to < month.from) continue
            const end = to < month.to ? to : month.to
            if (!best || end > best.end || (end === best.end && from >= best.start)) best = { goal, end, start: from }
        }
    }
    return best?.goal ?? null
}

/** Alvo mensal da meta no mês (só metas por mês: recorrente ou daquele mês específico). */
export function monthlyTargetOf(goal: Pick<BusinessGoalRecord, "period" | "mode" | "month" | "targetCents">, monthKey: string): number {
    return goal.period === "month" && (goal.mode === "recurring" || goal.month === monthKey) ? goal.targetCents : 0
}

export async function getBusinessDashboard(access: AccessContext, businessId: string, options: { period?: BusinessDashboardPeriod; timeZone?: string } = {}): Promise<BusinessDashboardDto> {
    const { business } = await readBusiness(access, businessId, "dashboard")
    const zone = normalizeTimeZone(options.timeZone ?? access.timeZone)
    const period = options.period ?? DEFAULT_BUSINESS_DASHBOARD_PERIOD
    const range = dashboardBuckets(period, todayKeyIn(zone))
    const models = businessModels()
    const [goals, days, activities, documents, successes] = await Promise.all([
        models.goals.find({ businessId }).lean<Lean<BusinessGoalRecord>[]>(),
        retentionDaysOf("goals"),
        models.activities.find({ businessId, status: "active" }).sort({ name: 1 }).lean<Lean<BusinessActivityRecord>[]>(),
        models.documents.find({ businessId, status: "active" }, { category: 1 }).lean<{ category: string | null }[]>(),
        models.successes.find({ businessId, status: "active" }, { date: 1, createdAt: 1 }).lean<{ date: string | null; createdAt: Date }[]>(),
    ])
    const currentGoal = goals.find((goal) => goal.status === "active") ?? null
    const progress = currentGoal ? await goalsProgress(businessId, [currentGoal], zone) : new Map()
    const goalItem = currentGoal ? toGoalItemDto(currentGoal, days, progress.get(currentGoal._id.toString())!) : null

    // Sucessos pela data informada (ou o dia do cadastro, no fuso do usuário).
    const successDays = successes.map((success) => success.date ?? todayKeyIn(zone, success.createdAt))
    const successRows = range.buckets.map((bucket) => ({ bucket: bucket.key, count: successDays.filter((day) => day >= bucket.from && day <= bucket.to).length }))

    // Evolução do valor/hora: as atividades de maior valor, pelo histórico de preços.
    const ranked = [...activities].sort((a, b) => b.hourlyRateCents - a.hourlyRateCents || a.name.localeCompare(b.name, "pt-BR"))
    const trendActivities = ranked.slice(0, RATE_TREND_MAX).map((activity) => ({ id: activity._id.toString(), name: activity.name }))
    const prices = trendActivities.length
        ? await models.activityPrices.find({ activityId: { $in: trendActivities.map((activity) => activity.id) } }).sort({ createdAt: 1 }).lean<Lean<ActivityPriceRecord>[]>()
        : []
    const priceDays = prices.map((price) => ({ activityId: price.activityId, toCents: price.toCents, day: todayKeyIn(zone, price.createdAt) }))

    // Faturamento bruto × meta mensal (por mês do período) e o total do período.
    const measured = await measureGoalWindows(businessId, [...range.months, { key: "period", label: "", from: range.from, to: range.to }])
    const revenueRows = range.months.map((month) => {
        const goal = goalActiveIn(goals, month, zone)
        return { bucket: month.key, revenueCents: measured.get(month.key)?.revenueCents ?? 0, targetCents: goal ? monthlyTargetOf(goal, month.key) : 0 }
    })
    const rates = activities.map((activity) => activity.hourlyRateCents)

    return {
        businessId,
        currency: business.currency,
        timeZone: zone,
        period,
        granularity: range.granularity,
        range: { from: range.from, to: range.to },
        goal: goalItem,
        counts: { activities: activities.length, goals: goalItem ? 1 : 0, documents: documents.length, successes: successes.length },
        kpis: {
            currentGoalPercent: goalItem?.progress.current?.available ? (goalItem.progress.current.percent ?? 0) : null,
            revenueCents: measured.get("period")?.revenueCents ?? 0,
            activeActivities: activities.length,
            averageRateCents: rates.length ? Math.round(rates.reduce((sum, rate) => sum + rate, 0) / rates.length) : null,
            documents: documents.length,
            successesInPeriod: successRows.reduce((sum, row) => sum + row.count, 0),
        },
        charts: {
            activityRates: ranked.slice(0, RATE_RANKING_MAX).map((activity) => ({ name: activity.name, rateCents: activity.hourlyRateCents })),
            activitiesByCategory: categorySlices(activities.map((activity) => activity.category)),
            documentsByCategory: categorySlices(documents.map((document) => document.category)),
            successes: successRows,
            rateTrend: { activities: trendActivities.map((activity, index) => ({ key: `a${index}`, name: activity.name })), rows: rateTrendRows(range.buckets, trendActivities, priceDays) },
            revenue: revenueRows,
            hasRevenue: revenueRows.some((row) => row.revenueCents > 0),
        },
    }
}
