import { z } from "zod"
import { opexMainModelSchema } from "@/features/opex-agent/schemas"
import {
    DEFAULT_ORDER_TITLE_INSTRUCTIONS,
    CLIENT_EMAIL_MAX,
    CLIENT_NAME_MAX,
    CLIENT_NOTES_MAX,
    CLIENT_PHONE_MAX,
    ORDER_ATTACHMENTS_MAX,
    ORDER_DECISION_NAME_MAX,
    ORDER_DESCRIPTION_MAX,
    ORDER_ITEM_MINUTES_MAX,
    ORDER_ITEMS_MAX,
    ORDER_REJECT_REASON_MAX,
    ORDER_STATUSES,
    ORDER_SUMMARY_MAX,
    ORDER_TITLE_MAX,
    ORDER_TOTAL_MAX_CENTS,
} from "./constants"

/** Entradas de Clientes e Pedidos (M3) — mesmas regras na tela, na API e no Agente Opex. */

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Id inválido")
const version = z.number().int().nonnegative()
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD").refine((key) => {
    const date = new Date(`${key}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === key
}, "Data inválida")
const optionalText = (max: number, label: string) => z.string().trim().max(max, `Até ${max.toLocaleString("pt-BR")} caracteres ${label}`).nullable().optional()

// ── Clientes ───────────────────────────────────────────────────────────────

const clientName = z.string().trim().min(1, "Informe o nome do cliente").max(CLIENT_NAME_MAX, `Até ${CLIENT_NAME_MAX} caracteres no nome`)
const clientEmail = z.union([z.literal(""), z.string().trim().toLowerCase().max(CLIENT_EMAIL_MAX, "E-mail muito longo").pipe(z.email({ error: "E-mail inválido" }))]).nullable().optional()
const clientPhone = z
    .string()
    .trim()
    .max(CLIENT_PHONE_MAX, `Até ${CLIENT_PHONE_MAX} caracteres no telefone`)
    .regex(/^[\d\s()+.-]*$/, "Telefone: use só números, espaços, parênteses, + e -")
    .nullable()
    .optional()

export const clientCreateSchema = z.strictObject({
    name: clientName,
    email: clientEmail,
    phone: clientPhone,
    notes: optionalText(CLIENT_NOTES_MAX, "nas observações"),
})
export type ClientCreateInput = z.infer<typeof clientCreateSchema>

export const clientUpdateSchema = z.strictObject({
    name: clientName.optional(),
    email: clientEmail,
    phone: clientPhone,
    notes: optionalText(CLIENT_NOTES_MAX, "nas observações"),
    version,
})

export const clientStatusQuerySchema = z.enum(["active", "archived", "all"]).catch("all")

// ── Pedidos ────────────────────────────────────────────────────────────────

export const orderMinutesSchema = z
    .number({ error: "Informe as horas estimadas" })
    .int("Horas em minutos inteiros")
    .min(0, "As horas não podem ser negativas")
    .max(ORDER_ITEM_MINUTES_MAX, "Horas estimadas muito altas")

/**
 * Item do pedido: `id` de um item existente (mantém a atividade e o valor/hora congelado) ou
 * `activityId` de uma atividade ATIVA do negócio (o valor/hora é copiado agora).
 */
export const orderItemInputSchema = z
    .strictObject({
        id: z.string().trim().min(1).max(40).optional(),
        activityId: objectIdSchema.optional(),
        minutes: orderMinutesSchema,
    })
    .refine((item) => Boolean(item.id) !== Boolean(item.activityId), "Cada item tem o id de um item existente ou a atividade nova")
export type OrderItemInput = z.infer<typeof orderItemInputSchema>

export const orderAttachmentInputSchema = z.strictObject({ fileId: objectIdSchema, clientVisible: z.boolean().default(true) })

const items = z.array(orderItemInputSchema).max(ORDER_ITEMS_MAX, `Até ${ORDER_ITEMS_MAX} itens`).refine((list) => {
    const ids = list.flatMap((item) => item.id ? [item.id] : [])
    return new Set(ids).size === ids.length
}, "Item existente repetido")
const attachments = z
    .array(orderAttachmentInputSchema)
    .max(ORDER_ATTACHMENTS_MAX, `Até ${ORDER_ATTACHMENTS_MAX} anexos`)
    .refine((list) => new Set(list.map((file) => file.fileId)).size === list.length, "Anexo repetido")
const description = z.string().trim().min(1, "Descreva a necessidade do cliente").max(ORDER_DESCRIPTION_MAX, `Até ${ORDER_DESCRIPTION_MAX.toLocaleString("pt-BR")} caracteres na descrição`)
/** Título/resumo manuais: texto prevalece sobre a IA; vazio/`null` devolve o campo à IA. */
const title = z.string().trim().max(ORDER_TITLE_MAX, `Até ${ORDER_TITLE_MAX} caracteres no título`).nullable().optional()
const summary = z.string().trim().max(ORDER_SUMMARY_MAX, `Até ${ORDER_SUMMARY_MAX} caracteres no resumo`).nullable().optional()
/** Valor ajustado manualmente; `null` volta ao calculado (Σ horas × valor/hora). */
const totalOverride = z.number({ error: "Informe o valor" }).int("Valor em unidades mínimas (centavos)").min(0, "O valor não pode ser negativo").max(ORDER_TOTAL_MAX_CENTS, "Valor muito alto").nullable().optional()

export const orderCreateSchema = z
    .strictObject({
        clientId: objectIdSchema.optional(),
        /** Cliente criado junto com o pedido (inline). */
        newClient: clientCreateSchema.optional(),
        description,
        title,
        summary,
        items: items.default([]),
        totalOverrideCents: totalOverride,
        dueDate: dateKey.nullable().optional(),
        attachments: attachments.default([]),
    })
    .refine((input) => Boolean(input.clientId) !== Boolean(input.newClient), { message: "Escolha um cliente ou cadastre um novo", path: ["clientId"] })
export type OrderCreateInput = z.infer<typeof orderCreateSchema>

export const orderUpdateSchema = z
    .strictObject({
        clientId: objectIdSchema.optional(),
        newClient: clientCreateSchema.optional(),
        description: description.optional(),
        title,
        summary,
        /** Lista COMPLETA dos itens. */
        items: items.optional(),
        totalOverrideCents: totalOverride,
        dueDate: dateKey.nullable().optional(),
        /** Lista COMPLETA dos anexos (os atuais que ficam + os novos enviados). */
        attachments: attachments.optional(),
        version,
    })
    .refine((input) => !(input.clientId && input.newClient), { message: "Escolha um cliente ou cadastre um novo", path: ["clientId"] })
export type OrderUpdateInput = z.infer<typeof orderUpdateSchema>

/** Enviar (gera/renova o link) e, opcionalmente, mandar o e-mail ao cliente. */
export const orderSendSchema = z.strictObject({
    validUntil: dateKey.optional(),
    email: z.boolean().default(false),
    version,
})

export const orderVersionActionSchema = z.strictObject({ version })
export const orderRejectSchema = z.strictObject({ reason: optionalText(ORDER_REJECT_REASON_MAX, "no motivo"), version })

export const orderListQuerySchema = z.object({
    businessId: objectIdSchema.optional().catch(undefined),
    clientId: objectIdSchema.optional().catch(undefined),
    status: z.enum(ORDER_STATUSES).optional().catch(undefined),
})

// ── Link público ───────────────────────────────────────────────────────────

const deciderName = z.string().trim().min(2, "Informe o seu nome").max(ORDER_DECISION_NAME_MAX, `Até ${ORDER_DECISION_NAME_MAX} caracteres no nome`)
export const quoteAcceptSchema = z.strictObject({ name: deciderName })
export const quoteRejectSchema = z.strictObject({ name: deciderName.nullable().optional().or(z.literal("")), reason: optionalText(ORDER_REJECT_REASON_MAX, "no motivo") })

// ── Agente de título ───────────────────────────────────────────────────────

export const orderTitleFeatureSchema = z
    .object({
        enabled: z.boolean(),
        main: opexMainModelSchema,
        instructions: z.string().trim().min(1, "Informe as instruções").max(8000, "Até 8.000 caracteres"),
    })
    .superRefine((value, ctx) => {
        if (!value.enabled) return
        if (!value.main.provider) ctx.addIssue({ code: "custom", path: ["main", "provider"], message: "Selecione o provedor" })
        if (!value.main.model) ctx.addIssue({ code: "custom", path: ["main", "model"], message: "Selecione o modelo" })
    })
export type OrderTitleFeatureSettings = z.infer<typeof orderTitleFeatureSchema>

export const DEFAULT_ORDER_TITLE_FEATURE: OrderTitleFeatureSettings = {
    enabled: false,
    main: { provider: null, model: null, variant: null, temperature: null, maxOutputTokens: null },
    instructions: DEFAULT_ORDER_TITLE_INSTRUCTIONS,
}
