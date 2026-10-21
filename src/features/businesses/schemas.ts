import { z } from "zod"
import { opexMainModelSchema } from "@/features/opex-agent/schemas"
import {
    BUSINESS_DESCRIPTION_MAX,
    BUSINESS_FIELDS,
    BUSINESS_LINKS_MAX,
    BUSINESS_NAME_MAX,
    BUSINESS_TYPES,
    CURRENCIES,
    DEFAULT_INTERVIEW_QUESTIONS,
    DEFAULT_INTERVIEWER_INSTRUCTIONS,
    GOAL_MEASURES,
    GOAL_MODES,
    GOAL_PERIODS,
    INTERVIEW_MESSAGE_MAX,
    INTERVIEW_PROMPT_MAX,
} from "./constants"
import { businessThemeSchema, contactEmailSchema, contactPhoneSchema, deadlineAlertDaysSchema, quoteValidityDaysSchema } from "./space-schemas"

/** Valores dos campos nativos do Negócio — mesmas regras na entrevista, na API e no Agente Opex. */

export const businessNameSchema = z.string().trim().min(1, "Informe o nome").max(BUSINESS_NAME_MAX, `Até ${BUSINESS_NAME_MAX} caracteres`)
export const businessTypeSchema = z.enum(BUSINESS_TYPES, { error: "Use PF (pessoa física) ou PJ (pessoa jurídica)" })
export const businessSubtypeSchema = z.string().trim().max(60, "Até 60 caracteres")
export const businessSegmentSchema = z.string().trim().min(1, "Informe a área ou o segmento").max(120, "Até 120 caracteres")
export const businessDescriptionSchema = z.string().trim().min(1, "Informe a descrição").max(BUSINESS_DESCRIPTION_MAX, `Até ${BUSINESS_DESCRIPTION_MAX} caracteres`)
export const currencySchema = z.enum(CURRENCIES, { error: `Moeda inválida: use ${CURRENCIES.join(", ")}` })

/** URL válida (http/https), normalizada. */
export const businessLinkSchema = z
    .string()
    .trim()
    .max(500, "Link muito longo")
    .transform((value) => (/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`))
    .pipe(z.url({ protocol: /^https?$/, error: "URL inválida" }))
export const businessLinksSchema = z
    .array(businessLinkSchema)
    .min(1, "Informe ao menos um link")
    .max(BUSINESS_LINKS_MAX, `Até ${BUSINESS_LINKS_MAX} links`)
    .transform((links) => [...new Set(links)])

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário no formato HH:mm")

/** Disponibilidade: dias da semana e, opcionalmente, a janela de horário de cada dia. */
export const availabilityDaySchema = z
    .object({
        weekday: z.number().int().min(0, "Dia de 0 (domingo) a 6 (sábado)").max(6, "Dia de 0 (domingo) a 6 (sábado)"),
        start: time.nullable().optional(),
        end: time.nullable().optional(),
    })
    .transform((day) => ({ weekday: day.weekday, start: day.start ?? null, end: day.end ?? null }))
    .refine((day) => (day.start === null) === (day.end === null), "Informe o início e o fim do horário (ou nenhum dos dois)")
    .refine((day) => day.start === null || day.end === null || day.start < day.end, "O início do horário precisa ser antes do fim")
export const availabilitySchema = z
    .array(availabilityDaySchema)
    .min(1, "Informe ao menos um dia")
    .max(7)
    .refine((days) => new Set(days.map((day) => day.weekday)).size === days.length, "Cada dia da semana aparece uma vez só")
    .transform((days) => [...days].sort((a, b) => a.weekday - b.weekday))

const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês no formato AAAA-MM")
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")

/**
 * Meta (M2): somente faturamento bruto, alvo em unidades mínimas (centavos) e período hora/mês/ano.
 * Mês/ano: recorrente ou específico. Hora: janela de medição mês, ano (cada um recorrente ou
 * específico) ou intervalo de datas.
 */
export const goalSchema = z
    .object({
        name: z.string().trim().max(80, "Até 80 caracteres").nullable().optional(),
        targetCents: z.number({ error: "Informe o valor alvo" }).int("Valor em centavos (inteiro)").positive("O valor alvo precisa ser maior que zero").max(1e13),
        period: z.enum(GOAL_PERIODS, { error: "Período: hour, month ou year" }),
        measure: z.enum(GOAL_MEASURES).nullable().optional(),
        mode: z.enum(GOAL_MODES).nullable().optional(),
        month: monthKey.nullable().optional(),
        year: z.number().int().min(2000).max(2200).nullable().optional(),
        from: dateKey.nullable().optional(),
        to: dateKey.nullable().optional(),
    })
    .superRefine((goal, ctx) => {
        const base = goal.period === "hour" ? goal.measure : goal.period
        if (goal.period === "hour" && !goal.measure) ctx.addIssue({ code: "custom", path: ["measure"], message: "Meta por hora: informe a janela de medição (month, year ou range)" })
        if (base === "month" || base === "year") {
            if (!goal.mode) ctx.addIssue({ code: "custom", path: ["mode"], message: "Informe se a meta é recorrente (recurring) ou específica (specific)" })
            if (goal.mode === "specific" && base === "month" && !goal.month) ctx.addIssue({ code: "custom", path: ["month"], message: "Meta de um mês específico: informe o mês (AAAA-MM)" })
            if (goal.mode === "specific" && base === "year" && !goal.year) ctx.addIssue({ code: "custom", path: ["year"], message: "Meta de um ano específico: informe o ano" })
        }
        if (base === "range") {
            if (!goal.from || !goal.to) ctx.addIssue({ code: "custom", path: ["from"], message: "Intervalo de datas: informe o início e o fim" })
            else if (goal.from > goal.to) ctx.addIssue({ code: "custom", path: ["to"], message: "O fim do intervalo precisa ser depois do início" })
        }
    })
    .transform((goal) => {
        const base = goal.period === "hour" ? goal.measure! : goal.period
        const specific = (base === "month" || base === "year") && goal.mode === "specific"
        return {
            name: goal.name?.trim() || null,
            targetCents: goal.targetCents,
            period: goal.period,
            measure: goal.period === "hour" ? goal.measure! : null,
            mode: base === "range" ? null : goal.mode!,
            month: specific && base === "month" ? goal.month! : null,
            year: specific && base === "year" ? goal.year! : null,
            from: base === "range" ? goal.from! : null,
            to: base === "range" ? goal.to! : null,
        }
    })
export type BusinessGoalInput = z.output<typeof goalSchema>
/** Meta da entrevista: uma só por negócio (lista de um item, como o campo `goals` do roteiro). */
export const goalsSchema = z.array(goalSchema).min(1, "Informe a meta").max(1, "Uma meta por negócio")

export type AvailabilityDay = z.output<typeof availabilityDaySchema>

/** Edição da ficha (tela do M2 e Agente Opex). Só os campos informados mudam. */
export const businessUpdateSchema = z.strictObject({
    theme: businessThemeSchema.optional(),
    /** `null` = usa o e-mail da conta do dono. */
    contactEmail: contactEmailSchema.nullable().optional(),
    contactPhone: contactPhoneSchema.nullable().optional(),
    deadlineAlertDays: deadlineAlertDaysSchema.optional(),
    quoteValidityDays: quoteValidityDaysSchema.optional(),
    name: z.string().trim().max(BUSINESS_NAME_MAX).optional(),
    type: businessTypeSchema.nullable().optional(),
    subtype: businessSubtypeSchema.nullable().optional(),
    segment: z.string().trim().max(120).nullable().optional(),
    description: z.string().trim().max(BUSINESS_DESCRIPTION_MAX).nullable().optional(),
    links: z.array(businessLinkSchema).max(BUSINESS_LINKS_MAX).optional(),
    availability: z.array(availabilityDaySchema).max(7).optional(),
    currency: currencySchema.optional(),
    version: z.number().int().nonnegative(),
})
export type BusinessUpdateInput = z.infer<typeof businessUpdateSchema>

// ── Roteiro e configuração do Entrevistador ────────────────────────────────

export const interviewQuestionSchema = z.object({
    field: z.enum(BUSINESS_FIELDS),
    prompt: z.string().trim().min(1, "Informe o texto da pergunta").max(INTERVIEW_PROMPT_MAX, `Até ${INTERVIEW_PROMPT_MAX} caracteres`),
    required: z.boolean(),
    active: z.boolean(),
})

/** Roteiro: lista ordenada (a ordem é a da lista), cada campo no máximo uma vez. */
export const interviewQuestionsSchema = z
    .array(interviewQuestionSchema)
    .max(BUSINESS_FIELDS.length)
    .refine((questions) => new Set(questions.map((question) => question.field)).size === questions.length, "Cada campo aparece no máximo uma vez no roteiro")
    .refine((questions) => questions.some((question) => question.active), "Deixe ao menos uma pergunta ativa")

export const saveInterviewScriptSchema = z.strictObject({
    questions: interviewQuestionsSchema,
    notes: z.string().trim().max(500, "Até 500 caracteres").default(""),
    /** Versão vigente na abertura do editor (conflito se outra gravação aconteceu). */
    version: z.number().int().nonnegative(),
})

export const interviewerSettingsSchema = z
    .object({
        enabled: z.boolean(),
        main: opexMainModelSchema,
        instructions: z.string().trim().min(1, "Informe as instruções").max(12_000, "Até 12.000 caracteres"),
    })
    .superRefine((value, ctx) => {
        if (!value.enabled) return
        if (!value.main.provider) ctx.addIssue({ code: "custom", path: ["main", "provider"], message: "Selecione o provedor" })
        if (!value.main.model) ctx.addIssue({ code: "custom", path: ["main", "model"], message: "Selecione o modelo" })
    })
export type InterviewerSettings = z.infer<typeof interviewerSettingsSchema>

export const DEFAULT_INTERVIEWER_SETTINGS: InterviewerSettings = {
    enabled: false,
    main: { provider: null, model: null, variant: null, temperature: null, maxOutputTokens: null },
    instructions: DEFAULT_INTERVIEWER_INSTRUCTIONS,
}

export const DEFAULT_INTERVIEW_SCRIPT = DEFAULT_INTERVIEW_QUESTIONS.map((question) => ({ ...question }))

// ── Chat da entrevista ─────────────────────────────────────────────────────

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Id inválido")

export const sendInterviewMessageSchema = z
    .object({
        text: z.string().trim().max(INTERVIEW_MESSAGE_MAX, `Até ${INTERVIEW_MESSAGE_MAX.toLocaleString("pt-BR")} caracteres`).default(""),
        fileIds: z.array(objectId).max(1, "Envie uma imagem por vez").default([]),
    })
    .refine((value) => value.text.length > 0 || value.fileIds.length > 0, { message: "Escreva uma mensagem ou anexe a imagem", path: ["text"] })

export const reserveInterviewFileSchema = z.object({
    name: z.string().trim().min(1, "Informe o nome do arquivo").max(300, "Nome muito longo"),
    size: z.number({ error: "Informe o tamanho do arquivo" }).int().min(1, "O arquivo está vazio"),
    mediaType: z.string().trim().max(200).optional(),
})
export type ReserveInterviewFileInput = z.infer<typeof reserveInterviewFileSchema>
