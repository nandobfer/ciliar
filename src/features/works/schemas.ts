import { z } from "zod"
import { dateKeySchema, objectIdSchema, orderItemsSchema, orderTotalOverrideSchema } from "@/features/orders/schemas"
import { COLUMN_COLORS, COLUMN_ICON_KEYS } from "./board"
import {
    TIME_ENTRY_SOURCES,
    WORK_ATTACHMENTS_MAX,
    WORK_COLUMN_DESCRIPTION_MAX,
    WORK_COLUMN_NAME_MAX,
    WORK_NOTE_MAX,
    WORK_PAYMENT_METHOD_MAX,
    WORK_TIME_DESCRIPTION_MAX,
    WORK_TIME_ENTRY_MINUTES_MAX,
} from "./constants"
import { ORDER_TOTAL_MAX_CENTS } from "@/features/orders/constants"

/** Entradas dos Trabalhos (M4) — mesmas regras na tela, na API e no Agente Opex. */

const version = z.number().int().nonnegative()
const columnKey = z.string().trim().min(1, "Informe a coluna").max(40)
const position = z.number().optional()

// ── Colunas ────────────────────────────────────────────────────────────────

export const workColumnInputSchema = z.object({
    name: z.string().trim().min(1, "Informe o nome da coluna").max(WORK_COLUMN_NAME_MAX, `Até ${WORK_COLUMN_NAME_MAX} caracteres no nome`),
    color: z.enum(COLUMN_COLORS, { error: "Cor inválida" }),
    icon: z.enum(COLUMN_ICON_KEYS, { error: "Ícone inválido" }),
    description: z.string().trim().max(WORK_COLUMN_DESCRIPTION_MAX, `Até ${WORK_COLUMN_DESCRIPTION_MAX} caracteres na descrição`).default(""),
})
export type WorkColumnInput = z.infer<typeof workColumnInputSchema>
/** Formulário da tela (descrição sempre presente, sem `default`). */
export const workColumnFormSchema = workColumnInputSchema.extend({ description: z.string().trim().max(WORK_COLUMN_DESCRIPTION_MAX, `Até ${WORK_COLUMN_DESCRIPTION_MAX} caracteres na descrição`) })

export const workColumnCreateSchema = workColumnInputSchema.extend({
    /** Coluna depois da qual a nova entra (sem ela, ou depois de Pago: antes de Pago). */
    afterKey: z.string().trim().max(40).nullable().optional(),
})
export type WorkColumnCreateInput = z.infer<typeof workColumnCreateSchema>

export const workColumnsReorderSchema = z.strictObject({ order: z.array(columnKey).min(4).max(40) })

// ── Trabalhos ──────────────────────────────────────────────────────────────

/** Mover (arrastar ou "Mover para…"): Pago entra só pelo pagamento e sai só pelo estorno. */
export const workMoveSchema = z.strictObject({ column: columnKey, position, version })

const receivedCents = z
    .number({ error: "Informe o valor recebido" })
    .int("Valor em unidades mínimas (centavos)")
    .min(0, "O valor não pode ser negativo")
    .max(ORDER_TOTAL_MAX_CENTS, "Valor muito alto")
const paymentMethod = z.string().trim().max(WORK_PAYMENT_METHOD_MAX, `Até ${WORK_PAYMENT_METHOD_MAX} caracteres na forma de pagamento`).nullable().optional()

/** Entrar em Pago (ou corrigir o pagamento de um trabalho já pago). */
export const workPaymentSchema = z.strictObject({ paidOn: dateKeySchema, receivedCents, method: paymentMethod, position, version })
export type WorkPaymentInput = z.infer<typeof workPaymentSchema>

/** Sair de Pago: confirmação explícita e a coluna de destino; o pagamento sai do faturamento. */
export const workUnpaySchema = z.strictObject({ column: columnKey, position, confirm: z.literal(true, { error: "Confirme a saída de Pago" }), version })

/** Dados comerciais do pedido editados pelo trabalho (W1): itens, horas estimadas, valor e prazo. */
export const workUpdateSchema = z.strictObject({
    items: orderItemsSchema.optional(),
    totalOverrideCents: orderTotalOverrideSchema,
    dueDate: dateKeySchema.nullable().optional(),
    version,
})
export type WorkUpdateInput = z.infer<typeof workUpdateSchema>

export const workListQuerySchema = z.object({
    businessId: objectIdSchema.optional().catch(undefined),
    clientId: objectIdSchema.optional().catch(undefined),
    status: z.enum(["active", "archived", "all"]).catch("active"),
})

export const workAttachmentsSchema = z.strictObject({
    fileIds: z
        .array(objectIdSchema)
        .min(1, "Envie ao menos um arquivo")
        .max(WORK_ATTACHMENTS_MAX, `Até ${WORK_ATTACHMENTS_MAX} anexos`)
        .refine((ids) => new Set(ids).size === ids.length, "Anexo repetido"),
})

// ── Horas ──────────────────────────────────────────────────────────────────

const minutes = z
    .number({ error: "Informe as horas" })
    .int("Horas em minutos inteiros")
    .min(1, "Informe ao menos 0:01")
    .max(WORK_TIME_ENTRY_MINUTES_MAX, "Um lançamento vai até 24:00")
const timeDescription = z.string().trim().max(WORK_TIME_DESCRIPTION_MAX, `Até ${WORK_TIME_DESCRIPTION_MAX} caracteres na descrição`).nullable().optional()

/** Item/atividade: `orderItem` + id do item do pedido, ou `activity` + id de uma atividade ATIVA do negócio. */
export const timeEntryCreateSchema = z.strictObject({
    source: z.enum(TIME_ENTRY_SOURCES, { error: "Escolha o item ou a atividade" }),
    refId: z.string().trim().min(1, "Escolha o item ou a atividade").max(40),
    date: dateKeySchema,
    minutes,
    description: timeDescription,
})
export type TimeEntryCreateInput = z.infer<typeof timeEntryCreateSchema>

export const timeEntryUpdateSchema = z.strictObject({
    source: z.enum(TIME_ENTRY_SOURCES).optional(),
    refId: z.string().trim().min(1).max(40).optional(),
    date: dateKeySchema.optional(),
    minutes: minutes.optional(),
    description: timeDescription,
    version,
})

// ── Notas ──────────────────────────────────────────────────────────────────

export const workNoteSchema = z.strictObject({ content: z.string().trim().min(1, "Escreva a nota").max(WORK_NOTE_MAX, `Até ${WORK_NOTE_MAX.toLocaleString("pt-BR")} caracteres na nota`) })
