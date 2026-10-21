import { z } from "zod"
import { objectId } from "@/features/access/schemas"
import { GOAL_MEASURES, GOAL_MODES, GOAL_PERIODS } from "@/features/businesses/constants"
import { describeGoal, formatMoney } from "@/features/businesses/format"
import type { GoalWindowProgress } from "@/features/businesses/goal-progress"
import { archiveGoal, createGoal, deleteGoal, getCurrentGoal, getGoal, listGoals, restoreGoal, updateGoal } from "@/features/businesses/server/goals"
import { getBusinessDetail } from "@/features/businesses/server/businesses"
import type { GoalItemDto } from "@/features/businesses/types"
import { defineTool } from "./define"
import type { OpexToolContext } from "./define"

/**
 * Metas do negócio (M2): uma meta ativa por negócio, linha do tempo das anteriores; progresso no fuso
 * do navegador de quem iniciou o turno (padrão São Paulo).
 */

const businessId = objectId.describe("Id do negócio (de list_businesses)")
const goalId = objectId.describe("Id da meta (de list_goals)")

const goalFields = z.object({
    name: z.string().trim().max(80).nullable().optional(),
    targetCents: z.number().int().describe("Alvo em unidades mínimas da moeda do negócio (ex.: R$ 8.000,00 = 800000)"),
    period: z.enum(GOAL_PERIODS).describe("month = faturamento no mês; year = no ano; hour = valor médio faturado por hora"),
    measure: z.enum(GOAL_MEASURES).nullable().optional().describe("Só period=hour: janela de medição month, year ou range"),
    mode: z.enum(GOAL_MODES).nullable().optional().describe("Mês/ano: recurring (todo mês/ano) ou specific"),
    month: z.string().nullable().optional().describe("Mês específico AAAA-MM"),
    year: z.number().int().nullable().optional().describe("Ano específico"),
    from: z.string().nullable().optional().describe("Intervalo (measure=range): início AAAA-MM-DD"),
    to: z.string().nullable().optional().describe("Intervalo (measure=range): fim AAAA-MM-DD"),
})

const timeZoneOf = (context: OpexToolContext) => context.scope.timeZone ?? context.access.timeZone

function windowText(window: GoalWindowProgress | null, currency: string, hourly: boolean) {
    if (!window) return null
    return {
        label: window.label,
        from: window.from,
        to: window.to,
        revenue: formatMoney(window.revenueCents, currency),
        hours: Math.round((window.minutes / 60) * 10) / 10,
        achieved: window.available && window.achievedCents !== null ? `${formatMoney(window.achievedCents, currency)}${hourly ? "/hora" : ""}` : "indisponível (sem horas apontadas)",
        percent: window.percent,
    }
}

function slim(goal: GoalItemDto, currency: string) {
    const hourly = goal.period === "hour"
    return {
        id: goal.id,
        text: describeGoal(goal, currency),
        name: goal.name,
        targetCents: goal.targetCents,
        period: goal.period,
        measure: goal.measure,
        mode: goal.mode,
        month: goal.month,
        year: goal.year,
        from: goal.from,
        to: goal.to,
        status: goal.status,
        supersededReason: goal.supersededReason,
        activePeriods: goal.activePeriods,
        archivedAt: goal.archivedAt,
        purgeAt: goal.purgeAt,
        progress: { status: goal.progress.status, current: windowText(goal.progress.current, currency, hourly) },
    }
}

async function currencyOf(access: OpexToolContext["access"], id: string) {
    return (await getBusinessDetail(access, id)).currency
}

export const businessGoalTools = [
    defineTool("list_goals", {
        input: z.object({ businessId }),
        execute: async (input, context) => {
            const [list, currency] = await Promise.all([listGoals(context.access, input.businessId, { timeZone: timeZoneOf(context) }), currencyOf(context.access, input.businessId)])
            return {
                currency,
                editable: list.editable,
                note: "Uma meta ativa por negócio. Faturamento bruto = valores recebidos dos trabalhos em Pago, pela data do pagamento. Sem trabalhos pagos, o progresso é zero. superseded = histórico (somente leitura).",
                current: list.current ? slim(list.current, currency) : null,
                timeline: list.history.map((goal) => slim(goal, currency)),
            }
        },
    }),
    defineTool("get_current_goal", {
        input: z.object({ businessId }),
        execute: async (input, context) => {
            const [goal, currency] = await Promise.all([getCurrentGoal(context.access, input.businessId, timeZoneOf(context)), currencyOf(context.access, input.businessId)])
            if (!goal) return { currency, current: null, note: "O negócio está sem meta ativa." }
            const hourly = goal.period === "hour"
            return { currency, current: { ...slim(goal, currency), version: goal.version, history: goal.progress.history.map((window) => windowText(window, currency, hourly)) } }
        },
    }),
    defineTool("get_goal_progress", {
        input: z.object({ businessId, goalId }),
        execute: async (input, context) => {
            const [goal, currency] = await Promise.all([getGoal(context.access, input.businessId, input.goalId, timeZoneOf(context)), currencyOf(context.access, input.businessId)])
            const hourly = goal.period === "hour"
            return { ...slim(goal, currency), version: goal.version, history: goal.progress.history.map((window) => windowText(window, currency, hourly)) }
        },
    }),
    defineTool("create_goal", {
        input: goalFields.extend({ businessId }),
        summarize: (input) => `Definir a nova meta atual ${describeGoal({ ...input, name: input.name ?? null })} no negócio ${input.businessId} (a atual vai para a linha do tempo)`,
        execute: async ({ businessId: id, ...goal }, context) => slim(await createGoal(context.access, id, goal, timeZoneOf(context)), await currencyOf(context.access, id)),
    }),
    defineTool("update_goal", {
        input: goalFields.extend({ businessId, goalId }),
        summarize: (input) => `Criar uma nova versão da meta ${input.goalId}: ${describeGoal({ ...input, name: input.name ?? null })}`,
        execute: async ({ businessId: id, goalId: itemId, ...goal }, context) => {
            const current = await getGoal(context.access, id, itemId, timeZoneOf(context))
            return slim(await updateGoal(context.access, id, itemId, { ...goal, version: current.version }, timeZoneOf(context)), await currencyOf(context.access, id))
        },
    }),
    defineTool("archive_goal", {
        input: z.object({ businessId, goalId }),
        summarize: (input) => `Arquivar a meta atual ${input.goalId} (a anterior volta a valer; exclusão definitiva automática após o prazo da Plataforma)`,
        execute: async (input, context) => {
            const [result, currency] = await Promise.all([archiveGoal(context.access, input.businessId, input.goalId, timeZoneOf(context)), currencyOf(context.access, input.businessId)])
            return { archived: slim(result.archived, currency), current: result.current ? slim(result.current, currency) : null, note: result.current ? "A meta anterior voltou a ser a atual." : "O negócio ficou sem meta ativa." }
        },
    }),
    defineTool("restore_goal", {
        input: z.object({ businessId, goalId }),
        summarize: (input) => `Restaurar a meta arquivada ${input.goalId} como a atual (a atual vai para a linha do tempo)`,
        execute: async (input, context) => slim(await restoreGoal(context.access, input.businessId, input.goalId, timeZoneOf(context)), await currencyOf(context.access, input.businessId)),
    }),
    defineTool("delete_goal", {
        input: z.object({ businessId, goalId }),
        summarize: (input) => `Excluir definitivamente a meta arquivada ${input.goalId} (irreversível)`,
        execute: async (input, context) => ({ ok: true, ...(await deleteGoal(context.access, input.businessId, input.goalId)) }),
    }),
]
