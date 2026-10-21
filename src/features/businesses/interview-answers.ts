import { BUSINESS_FIELD_LABELS, BUSINESS_TYPE_LABELS, DEFAULT_CURRENCY, type BusinessField, type BusinessType, type Currency, type GoalMeasure, type GoalMode, type GoalPeriod } from "./constants"
import { describeAvailability, describeGoal } from "./format"
import { availabilitySchema, businessDescriptionSchema, businessLinksSchema, businessNameSchema, businessSegmentSchema, businessTypeSchema, currencySchema, goalsSchema } from "./schemas"
import type { OpexMessageDto, OpexPart } from "@/features/opex-agent/types"

/**
 * Respostas da entrevista montadas pelos controles da tela (módulo PURO). Os controles nunca gravam:
 * montam a resposta em texto e a enviam como mensagem ao Agente Entrevistador, que grava pela
 * ferramenta do campo (o servidor valida como sempre). A validação aqui usa os mesmos schemas Zod.
 */

export interface GoalDraft {
    targetCents: number
    period: GoalPeriod
    mode: GoalMode
    month: string
    year: number
    measure: GoalMeasure
    from: string
    to: string
}

export interface AnswerDrafts {
    name: string
    type: { type: BusinessType | null; subtype: string }
    segment: string
    description: string
    links: string[]
    availability: { weekday: number; start: string; end: string }[]
    goals: GoalDraft[]
    currency: Currency
}

export type AnswerDraft<F extends Exclude<BusinessField, "logo">> = AnswerDrafts[F]

const today = () => new Date()
const pad = (value: number) => String(value).padStart(2, "0")

export function emptyGoal(): GoalDraft {
    const now = today()
    return { targetCents: 0, period: "month", mode: "recurring", month: `${now.getFullYear()}-${pad(now.getMonth() + 1)}`, year: now.getFullYear(), measure: "month", from: "", to: "" }
}

/** Meta da tela no formato gravado (`goalSchema`): só os campos que a combinação usa. */
export function goalOf(draft: GoalDraft) {
    const base = { name: null, targetCents: draft.targetCents, period: draft.period }
    const windowBase = draft.period === "hour" ? draft.measure : draft.period
    const measure = draft.period === "hour" ? draft.measure : null
    if (windowBase === "range") return { ...base, measure, mode: null, month: null, year: null, from: draft.from || null, to: draft.to || null }
    const specific = draft.mode === "specific"
    return { ...base, measure, mode: draft.mode, month: specific && windowBase === "month" ? draft.month : null, year: specific && windowBase === "year" ? draft.year : null, from: null, to: null }
}

/** Rascunho inicial de um campo: o valor já gravado (correção) ou o vazio. */
export function draftFrom<F extends Exclude<BusinessField, "logo">>(field: F, value: unknown, subtype: string | null = null): AnswerDraft<F> {
    const has = value !== null && value !== undefined
    const drafts: { [K in Exclude<BusinessField, "logo">]: () => AnswerDrafts[K] } = {
        name: () => (has ? String(value) : ""),
        segment: () => (has ? String(value) : ""),
        description: () => (has ? String(value) : ""),
        type: () => ({ type: has ? (value as BusinessType) : null, subtype: subtype ?? "" }),
        links: () => (has && Array.isArray(value) && value.length ? (value as string[]) : [""]),
        availability: () => (has && Array.isArray(value) ? (value as { weekday: number; start: string | null; end: string | null }[]).map((day) => ({ weekday: day.weekday, start: day.start ?? "", end: day.end ?? "" })) : []),
        goals: () =>
            has && Array.isArray(value) && value.length
                ? (value as Record<string, unknown>[]).slice(-1).map((goal) => ({
                      ...emptyGoal(),
                      targetCents: Number(goal.targetCents) || 0,
                      period: (goal.period as GoalPeriod) ?? "month",
                      mode: (goal.mode as GoalMode) ?? "recurring",
                      month: (goal.month as string) ?? emptyGoal().month,
                      year: (goal.year as number) ?? emptyGoal().year,
                      measure: (goal.measure as GoalMeasure) ?? "month",
                      from: (goal.from as string) ?? "",
                      to: (goal.to as string) ?? "",
                  }))
                : [emptyGoal()],
        currency: () => (has ? (value as Currency) : DEFAULT_CURRENCY),
    }
    return drafts[field]() as AnswerDraft<F>
}

const firstIssue = (result: { success: boolean; error?: { issues: { message: string }[] } }) => (result.success ? null : (result.error?.issues[0]?.message ?? "Resposta inválida"))

/** Erro da resposta (mesmos schemas do servidor) ou `null` quando pode ser enviada. */
export function answerError<F extends Exclude<BusinessField, "logo">>(field: F, draft: AnswerDraft<F>): string | null {
    switch (field) {
        case "name":
            return firstIssue(businessNameSchema.safeParse(draft))
        case "segment":
            return firstIssue(businessSegmentSchema.safeParse(draft))
        case "description":
            return firstIssue(businessDescriptionSchema.safeParse(draft))
        case "type":
            return firstIssue(businessTypeSchema.safeParse((draft as AnswerDrafts["type"]).type ?? undefined))
        case "links": {
            const links = (draft as string[]).map((link) => link.trim()).filter(Boolean)
            return links.length ? firstIssue(businessLinksSchema.safeParse(links)) : "Informe ao menos um link"
        }
        case "availability": {
            const days = draft as AnswerDrafts["availability"]
            if (!days.length) return "Escolha ao menos um dia"
            return firstIssue(availabilitySchema.safeParse(days.map((day) => ({ weekday: day.weekday, start: day.start || null, end: day.end || null }))))
        }
        case "goals": {
            const goals = draft as GoalDraft[]
            if (goals.some((goal) => goal.targetCents <= 0)) return "Informe o valor de cada meta"
            return firstIssue(goalsSchema.safeParse(goals.map(goalOf)))
        }
        case "currency":
            return firstIssue(currencySchema.safeParse(draft))
        default:
            return null
    }
}

/** Resposta em texto enviada ao entrevistador (pt-BR, no formato que o modelo grava com a ferramenta). */
export function composeAnswer<F extends Exclude<BusinessField, "logo">>(field: F, draft: AnswerDraft<F>, currency: string = DEFAULT_CURRENCY): string {
    switch (field) {
        case "type": {
            const { type, subtype } = draft as AnswerDrafts["type"]
            if (!type) return ""
            return `${BUSINESS_TYPE_LABELS[type]} (${type})${subtype.trim() ? `, ${subtype.trim()}` : ""}`
        }
        case "links":
            return (draft as string[]).map((link) => link.trim()).filter(Boolean).join("; ")
        case "availability":
            return describeAvailability([...(draft as AnswerDrafts["availability"])].sort((a, b) => a.weekday - b.weekday).map((day) => ({ weekday: day.weekday, start: day.start || null, end: day.end || null })))
        case "goals":
            return (draft as GoalDraft[]).map((goal) => describeGoal(goalOf(goal), currency)).join("; ")
        default:
            return String(draft).trim()
    }
}

export const SKIP_MESSAGE = "Quero pular esta pergunta."
export const LOGO_MESSAGE = "Esta é a imagem do negócio (logo/foto)."

/** Correção pela ficha: o entrevistador grava o campo de novo e volta à pergunta em que estavam. */
export const correctionMessage = (field: BusinessField, answer: string) => `Quero corrigir ${BUSINESS_FIELD_LABELS[field]}: ${answer}`

const textOf = (parts: readonly OpexPart[]) =>
    parts
        .filter((part): part is Extract<OpexPart, { type: "text" }> => part.type === "text")
        .map((part) => part.text)
        .join("\n\n")
        .trim()

/** Fala atual do entrevistador (só o texto; ferramentas e raciocínio ficam de fora) e a última resposta do usuário. */
export function currentExchange(messages: readonly OpexMessageDto[], live: { parts: OpexPart[] } | null): { agentText: string; lastAgent: OpexMessageDto | null; lastUser: OpexMessageDto | null } {
    const lastAgent = [...messages].reverse().find((message) => message.role === "assistant" && message.kind === "message") ?? null
    const lastUser = [...messages].reverse().find((message) => message.role === "user" && message.kind === "message") ?? null
    const userAfterAgent = lastUser && lastAgent ? messages.indexOf(lastUser) > messages.indexOf(lastAgent) : Boolean(lastUser)
    // Turno em andamento: a fala nova substitui a anterior assim que começa a chegar.
    const liveText = live ? textOf(live.parts) : ""
    const agentText = live ? liveText : userAfterAgent ? "" : lastAgent ? textOf(lastAgent.parts) || lastAgent.text : ""
    return { agentText, lastAgent: live ? null : lastAgent, lastUser }
}
