import { z } from "zod"
import {
    ACTIVITY_NAME_MAX,
    BUSINESS_FILE_PURPOSES,
    BUSINESS_PHONE_MAX,
    BUSINESS_THEME_MODES,
    CATEGORY_MAX,
    DOCUMENT_NAME_MAX,
    HOURLY_RATE_MAX_CENTS,
    ITEM_DESCRIPTION_MAX,
    MAX_BUSINESS_DAYS_SETTING,
    SUCCESS_ATTACHMENTS_MAX,
    SUCCESS_RESULT_MAX,
    SUCCESS_TITLE_MAX,
} from "./constants"

/** Entradas do espaço do negócio (M2) — mesmas regras na tela, na API e no Agente Opex. */

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Id inválido")
const version = z.number().int().nonnegative()
const optionalText = (max: number, label = "texto") => z.string().trim().max(max, `Até ${max.toLocaleString("pt-BR")} caracteres no ${label}`).nullable().optional()
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")

export const hexColorSchema = z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i, "Cor no formato #RRGGBB")
    .transform((value) => value.toUpperCase())

export const businessThemeSchema = z.strictObject({
    primaryColor: hexColorSchema,
    mode: z.enum(BUSINESS_THEME_MODES, { error: "Modo: dark (escuro) ou light (claro)" }),
})
export type BusinessThemeInput = z.infer<typeof businessThemeSchema>

export const contactEmailSchema = z.string().trim().toLowerCase().max(200, "E-mail muito longo").pipe(z.email({ error: "E-mail inválido" }))
export const contactPhoneSchema = z
    .string()
    .trim()
    .max(BUSINESS_PHONE_MAX, `Até ${BUSINESS_PHONE_MAX} caracteres`)
    .regex(/^[\d\s()+.-]*$/, "Telefone: use só números, espaços, parênteses, + e -")
export const deadlineAlertDaysSchema = z.number({ error: "Informe os dias" }).int("Use dias inteiros").min(0, "Use 0 ou mais dias").max(MAX_BUSINESS_DAYS_SETTING, `Até ${MAX_BUSINESS_DAYS_SETTING} dias`)
export const quoteValidityDaysSchema = z.number({ error: "Informe os dias" }).int("Use dias inteiros").min(1, "Use ao menos 1 dia").max(MAX_BUSINESS_DAYS_SETTING, `Até ${MAX_BUSINESS_DAYS_SETTING} dias`)

const category = z.string().trim().max(CATEGORY_MAX, `Até ${CATEGORY_MAX} caracteres na categoria`).nullable().optional()

// ── Atividades ─────────────────────────────────────────────────────────────

export const hourlyRateSchema = z
    .number({ error: "Informe o valor por hora" })
    .int("Valor em unidades mínimas (centavos), inteiro")
    .min(0, "O valor por hora não pode ser negativo")
    .max(HOURLY_RATE_MAX_CENTS, "Valor por hora muito alto")

export const activityCreateSchema = z.strictObject({
    name: z.string().trim().min(1, "Informe o nome da atividade").max(ACTIVITY_NAME_MAX, `Até ${ACTIVITY_NAME_MAX} caracteres no nome`),
    description: optionalText(ITEM_DESCRIPTION_MAX, "descrição"),
    category,
    hourlyRateCents: hourlyRateSchema,
    active: z.boolean().default(true),
})
export type ActivityCreateInput = z.infer<typeof activityCreateSchema>

export const activityUpdateSchema = z.strictObject({
    name: activityCreateSchema.shape.name.optional(),
    description: optionalText(ITEM_DESCRIPTION_MAX, "descrição"),
    category,
    hourlyRateCents: hourlyRateSchema.optional(),
    active: z.boolean().optional(),
    version,
})

// ── Metas ──────────────────────────────────────────────────────────────────

/** Versão da meta na edição (a meta em si é validada pelo `goalSchema`). */
export const goalVersionSchema = z.object({ version })

// ── Documentos ─────────────────────────────────────────────────────────────

const documentName = z.string().trim().min(1, "Informe o nome do documento").max(DOCUMENT_NAME_MAX, `Até ${DOCUMENT_NAME_MAX} caracteres no nome`)

export const documentCreateSchema = z.strictObject({
    name: documentName,
    category,
    description: optionalText(ITEM_DESCRIPTION_MAX, "descrição"),
    portfolio: z.boolean().default(false),
    fileId: objectId,
})
export type DocumentCreateInput = z.infer<typeof documentCreateSchema>

export const documentUpdateSchema = z.strictObject({
    name: documentName.optional(),
    category,
    description: optionalText(ITEM_DESCRIPTION_MAX, "descrição"),
    portfolio: z.boolean().optional(),
    /** Troca o arquivo por outro já enviado (o anterior é removido). */
    fileId: objectId.optional(),
    version,
})

// ── Sucessos ───────────────────────────────────────────────────────────────

const successTitle = z.string().trim().min(1, "Informe o título").max(SUCCESS_TITLE_MAX, `Até ${SUCCESS_TITLE_MAX} caracteres no título`)
const attachmentIds = z
    .array(objectId)
    .max(SUCCESS_ATTACHMENTS_MAX, `Até ${SUCCESS_ATTACHMENTS_MAX} anexos`)
    .refine((ids) => new Set(ids).size === ids.length, "Anexo repetido")

export const successCreateSchema = z.strictObject({
    title: successTitle,
    description: optionalText(ITEM_DESCRIPTION_MAX, "descrição"),
    date: dateKey.nullable().optional(),
    result: optionalText(SUCCESS_RESULT_MAX, "resultado"),
    attachmentIds: attachmentIds.default([]),
    /** Cliente do dono ligado ao sucesso (M3). */
    clientId: objectId.nullable().optional(),
})
export type SuccessCreateInput = z.infer<typeof successCreateSchema>

export const successUpdateSchema = z.strictObject({
    title: successTitle.optional(),
    description: optionalText(ITEM_DESCRIPTION_MAX, "descrição"),
    date: dateKey.nullable().optional(),
    result: optionalText(SUCCESS_RESULT_MAX, "resultado"),
    /** Lista COMPLETA dos anexos: os atuais que ficam + os novos enviados. */
    attachmentIds: attachmentIds.optional(),
    clientId: objectId.nullable().optional(),
    version,
})

// ── Arquivos ───────────────────────────────────────────────────────────────

export const reserveBusinessFileSchema = z.strictObject({
    purpose: z.enum(BUSINESS_FILE_PURPOSES, { error: "Finalidade do arquivo inválida" }),
    name: z.string().trim().min(1, "Informe o nome do arquivo").max(300, "Nome muito longo"),
    size: z.number({ error: "Informe o tamanho do arquivo" }).int().min(1, "O arquivo está vazio"),
    mediaType: z.string().trim().max(200).optional(),
})
export type ReserveBusinessFileInput = z.infer<typeof reserveBusinessFileSchema>

export const setBusinessLogoSchema = z.strictObject({ fileId: objectId })

export const itemStatusQuerySchema = z.enum(["active", "archived", "all"]).catch("all")
