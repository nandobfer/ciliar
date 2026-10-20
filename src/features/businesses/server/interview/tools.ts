import { dynamicTool, type ToolSet } from "ai"
import { z, type ZodType } from "zod"
import { toolErrorMessage } from "@/features/opex-agent/server/tools/define"
import {
    BUSINESS_FIELD_LABELS,
    BUSINESS_FIELDS,
    BUSINESS_TYPES,
    CURRENCIES,
    GOAL_MEASURES,
    GOAL_MODES,
    GOAL_PERIODS,
    type BusinessField,
} from "../../constants"
import { formatFieldValue } from "../../format"
import {
    availabilitySchema,
    businessDescriptionSchema,
    businessLinksSchema,
    businessNameSchema,
    businessSegmentSchema,
    businessSubtypeSchema,
    businessTypeSchema,
    currencySchema,
    goalsSchema,
} from "../../schemas"
import { businessModels } from "../models"
import { completeInterview } from "./complete"
import { loadInterviewImage } from "./files"
import { loadInterview, nextQuestion, resolveInterviewAccess, type InterviewScope } from "./state"

/**
 * Ferramentas internas do Agente Entrevistador (não são do catálogo do Agente Opex). O modelo só
 * conduz a conversa: o servidor valida cada valor pelo tipo do campo, recusa pular pergunta
 * obrigatória, calcula a próxima pergunta e cria o Negócio quando a última é respondida.
 * Antes de cada chamada o acesso é relido (sessão, perfis e simulação).
 */

export interface InterviewToolContext {
    interviewId: string
    scope: InterviewScope
}

export interface InterviewToolInfo {
    label: string
}

class InterviewToolError extends Error {}

const describeIssues = (error: z.ZodError) => error.issues.map((issue) => `${issue.path.join(".") || "valor"}: ${issue.message}`).join("; ")

function parseValue<T>(schema: ZodType<T>, raw: unknown): T {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) throw new InterviewToolError(`Resposta inválida (${describeIssues(parsed.error)}). Explique ao usuário e peça de novo.`)
    return parsed.data
}

/** Entradas que o modelo vê (JSON Schema simples); a validação de verdade é a do campo. */
const fieldInputs: Record<Exclude<BusinessField, "logo">, { input: ZodType; value: (input: never) => unknown; schema: ZodType; description: string }> = {
    name: { input: z.object({ name: z.string() }), value: (input: { name: string }) => input.name, schema: businessNameSchema, description: "Grava o nome do negócio, exatamente como o usuário disse." },
    type: {
        input: z.object({ type: z.enum(BUSINESS_TYPES).describe("PF = pessoa física; PJ = pessoa jurídica") }),
        value: (input: { type: string }) => input.type,
        schema: businessTypeSchema,
        description: "Grava o tipo do negócio (PF ou PJ). Interprete o subtipo (MEI, ME, EPP, autônomo…) e grave com set_subtype.",
    },
    segment: { input: z.object({ segment: z.string() }), value: (input: { segment: string }) => input.segment, schema: businessSegmentSchema, description: "Grava a área/segmento (texto livre, como o usuário disse)." },
    description: { input: z.object({ description: z.string() }), value: (input: { description: string }) => input.description, schema: businessDescriptionSchema, description: "Grava a descrição/apresentação do negócio, com as palavras do usuário (sem inventar)." },
    links: {
        input: z.object({ links: z.array(z.string()).describe("URLs do site e das redes sociais") }),
        value: (input: { links: string[] }) => input.links,
        schema: businessLinksSchema,
        description: "Grava os links (site e redes sociais). URLs sem protocolo recebem https://.",
    },
    availability: {
        input: z.object({
            days: z
                .array(
                    z.object({
                        weekday: z.number().int().describe("0 = domingo, 1 = segunda … 6 = sábado"),
                        start: z.string().nullable().optional().describe("Início HH:mm (opcional)"),
                        end: z.string().nullable().optional().describe("Fim HH:mm (opcional)"),
                    }),
                )
                .describe("Um item por dia de atendimento"),
        }),
        value: (input: { days: unknown[] }) => input.days,
        schema: availabilitySchema,
        description: "Grava a disponibilidade: dias da semana e, por dia, a janela de horário (opcional).",
    },
    goals: {
        input: z.object({
            goals: z.array(
                z.object({
                    name: z.string().nullable().optional().describe("Nome opcional da meta"),
                    targetCents: z.number().int().describe("Valor alvo em centavos (R$ 5.000,00 = 500000)"),
                    period: z.enum(GOAL_PERIODS).describe("hour = valor médio por hora; month; year"),
                    measure: z.enum(GOAL_MEASURES).nullable().optional().describe("Só na meta por hora: janela de medição (month, year ou range)"),
                    mode: z.enum(GOAL_MODES).nullable().optional().describe("Mês/ano (ou janela mês/ano da meta por hora): recurring (todo mês/ano) ou specific"),
                    month: z.string().nullable().optional().describe("Mês específico AAAA-MM"),
                    year: z.number().int().nullable().optional().describe("Ano específico"),
                    from: z.string().nullable().optional().describe("Início do intervalo AAAA-MM-DD (janela range)"),
                    to: z.string().nullable().optional().describe("Fim do intervalo AAAA-MM-DD (janela range)"),
                }),
            ),
        }),
        value: (input: { goals: unknown[] }) => input.goals,
        schema: goalsSchema,
        description: "Grava as metas iniciais (só faturamento bruto), com o que o usuário decidiu: valor, período e recorrência/janela. Substitui a lista inteira.",
    },
    currency: { input: z.object({ currency: z.enum(CURRENCIES) }), value: (input: { currency: string }) => input.currency, schema: currencySchema, description: "Grava a moeda do negócio (ISO 4217)." },
}

const TOOL_NAME: Record<BusinessField, string> = {
    name: "set_name",
    type: "set_type",
    segment: "set_segment",
    description: "set_description",
    logo: "attach_logo",
    links: "set_links",
    availability: "set_availability",
    goals: "set_goals",
    currency: "set_currency",
}

export const INTERVIEW_TOOL_LABELS: Record<string, string> = {
    ...Object.fromEntries(BUSINESS_FIELDS.map((field) => [TOOL_NAME[field], `Resposta: ${BUSINESS_FIELD_LABELS[field]}`])),
    skip_question: "Pergunta pulada",
    set_subtype: "Subtipo interpretado",
}

async function context(ctx: InterviewToolContext) {
    const access = await resolveInterviewAccess(ctx.scope)
    const doc = await loadInterview(ctx.interviewId, access)
    if (doc.status !== "in_progress") throw new InterviewToolError("A entrevista já foi concluída: o negócio foi criado. Despeça-se em uma frase.")
    return { access, doc }
}

async function saveAnswer(ctx: InterviewToolContext, field: BusinessField, status: "answered" | "skipped", value: unknown) {
    const { access, doc } = await context(ctx)
    const question = doc.questions.find((item) => item.field === field && item.active)
    if (!question) throw new InterviewToolError(`O campo ${field} não faz parte deste roteiro.`)
    if (status === "skipped" && question.required) throw new InterviewToolError(`${BUSINESS_FIELD_LABELS[field]} é obrigatória: não pode ser pulada. Peça a resposta ao usuário.`)
    await businessModels().interviews.updateOne({ _id: doc._id, status: "in_progress" }, { $set: { [`answers.${field}`]: { status, value: status === "answered" ? value : null, updatedAt: new Date() } } })
    const fresh = await loadInterview(ctx.interviewId, access)
    const next = nextQuestion(fresh)
    const completed = next ? null : await completeInterview(ctx.interviewId, access)
    return {
        ok: true,
        field,
        status,
        ...(status === "answered" ? { saved: formatFieldValue(field, value, typeof fresh.answers?.currency?.value === "string" ? fresh.answers.currency.value : "BRL") } : {}),
        ...(completed
            ? { completed: true, businessName: completed.name, instruction: "O negócio foi criado. Despeça-se em uma frase: o usuário será levado ao espaço do negócio." }
            : next
              ? { nextQuestion: { field: next.field, label: BUSINESS_FIELD_LABELS[next.field], required: next.required, guidance: next.prompt } }
              : {}),
    }
}

function wrap(execute: (input: never) => Promise<unknown>): (input: unknown) => Promise<unknown> {
    return async (input: unknown) => {
        try {
            return await execute(input as never)
        } catch (error) {
            throw new Error(toolErrorMessage(error))
        }
    }
}

/** Ferramentas do turno: as dos campos ativos do roteiro + pular + subtipo. */
export function buildInterviewTools(fields: readonly BusinessField[], ctx: InterviewToolContext): ToolSet {
    const tools: ToolSet = {}
    for (const field of fields) {
        if (field === "logo") {
            tools[TOOL_NAME.logo] = dynamicTool({
                description: "Grava como logo/foto do negócio uma imagem que o usuário enviou no chat (use o fileId informado na mensagem).",
                inputSchema: z.object({ fileId: z.string() }),
                execute: wrap(async (input: { fileId: string }) => {
                    const { doc } = await context(ctx)
                    const file = await loadInterviewImage(doc._id, input.fileId)
                    return saveAnswer(ctx, "logo", "answered", { fileId: file._id.toString(), name: file.name, mediaType: file.mediaType, size: file.size })
                }),
            })
            continue
        }
        const def = fieldInputs[field]
        tools[TOOL_NAME[field]] = dynamicTool({
            description: def.description,
            inputSchema: def.input,
            execute: wrap(async (input: never) => saveAnswer(ctx, field, "answered", parseValue(def.schema, def.value(input)))),
        })
    }
    tools.skip_question = dynamicTool({
        description: "Marca uma pergunta OPCIONAL como pulada (o usuário pediu para pular). Perguntas obrigatórias são recusadas.",
        inputSchema: z.object({ field: z.enum(fields as [BusinessField, ...BusinessField[]]) }),
        execute: wrap(async (input: { field: BusinessField }) => saveAnswer(ctx, input.field, "skipped", null)),
    })
    tools.set_subtype = dynamicTool({
        description: "Grava o subtipo do negócio que você interpretou pelo que o usuário contou (ex.: MEI, ME, EPP, autônomo). Não faça pergunta própria para isso.",
        inputSchema: z.object({ subtype: z.string() }),
        execute: wrap(async (input: { subtype: string }) => {
            const { doc } = await context(ctx)
            const subtype = parseValue(businessSubtypeSchema, input.subtype)
            await businessModels().interviews.updateOne({ _id: doc._id, status: "in_progress" }, { $set: { subtype: subtype || null } })
            return { ok: true, subtype: subtype || null }
        }),
    })
    return tools
}

export const interviewToolLabel = (name: string) => INTERVIEW_TOOL_LABELS[name] ?? name
