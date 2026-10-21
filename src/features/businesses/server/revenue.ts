import { workModels } from "@/features/works/server/models"
import { measureRevenue, type RevenueWork } from "@/features/works/logic"
import type { GoalMeasurement, GoalWindow } from "../goal-progress"

/**
 * Medição do faturamento bruto das metas — SOMENTE servidor.
 *
 * Faturamento bruto = soma dos valores recebidos dos trabalhos em **Pago** e não arquivados, pela
 * **data do pagamento** (M4); horas = horas apontadas nesses trabalhos (meta por hora). Arquivar um
 * trabalho pago o tira do faturamento enquanto estiver arquivado; sair de Pago também.
 */
export async function measureGoalWindows(businessId: string, windows: readonly GoalWindow[]): Promise<Map<string, GoalMeasurement>> {
    if (!windows.length) return new Map()
    const from = windows.reduce((min, window) => (window.from < min ? window.from : min), windows[0]!.from)
    const to = windows.reduce((max, window) => (window.to > max ? window.to : max), windows[0]!.to)
    const works = await workModels()
        .works.find({ businessId, status: "active", column: "paid", "payment.paidOn": { $gte: from, $lte: to } })
        .select({ status: 1, column: 1, payment: 1, loggedMinutes: 1 })
        .lean<RevenueWork[]>()
    return new Map(windows.map((window) => [window.key, measureRevenue(works, window)]))
}
