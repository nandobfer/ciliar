import { z } from "zod"
import {
    DEFAULT_DOCUMENT_MAX_MB,
    DEFAULT_RETENTION_DAYS,
    DOCUMENT_TYPE_CATEGORIES,
    LEGAL_TEXT_MAX,
    MAX_DOCUMENT_MAX_MB,
    MAX_RETENTION_DAYS,
    MIN_DOCUMENT_MAX_MB,
    MIN_RETENTION_DAYS,
    RETENTION_TYPES,
    type RetentionType,
} from "./constants"

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "ID inválido")

const retentionDays = z
    .number({ error: "Informe a quantidade de dias" })
    .int("Use um número inteiro de dias")
    .min(MIN_RETENTION_DAYS, `Use pelo menos ${MIN_RETENTION_DAYS} dia`)
    .max(MAX_RETENTION_DAYS, `Use no máximo ${MAX_RETENTION_DAYS} dias`)

export const retentionSchema = z.strictObject(
    Object.fromEntries(RETENTION_TYPES.map((type) => [type, retentionDays])) as Record<RetentionType, typeof retentionDays>,
)

export const documentLimitsSchema = z.strictObject({
    maxFileSizeMb: z
        .number({ error: "Informe o tamanho máximo" })
        .int("Use um número inteiro de MB")
        .min(MIN_DOCUMENT_MAX_MB, `Use pelo menos ${MIN_DOCUMENT_MAX_MB} MB`)
        .max(MAX_DOCUMENT_MAX_MB, `Use no máximo ${MAX_DOCUMENT_MAX_MB} MB`),
    allowedTypes: z
        .array(z.enum(DOCUMENT_TYPE_CATEGORIES))
        .min(1, "Selecione ao menos um tipo de arquivo")
        .refine((values) => new Set(values).size === values.length, "Tipos repetidos"),
})

export const platformSettingsSchema = z.strictObject({
    /** Perfil atribuído no cadastro público; `null` desativa o cadastro público. */
    defaultRoleId: objectId.nullable(),
    retentionDays: retentionSchema,
    documents: documentLimitsSchema,
})
export type PlatformSettings = z.infer<typeof platformSettingsSchema>

export const platformSettingsUpdateSchema = platformSettingsSchema.extend({ version: z.number().int().nonnegative() }).strict()
export type PlatformSettingsUpdate = z.infer<typeof platformSettingsUpdateSchema>

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
    defaultRoleId: null,
    retentionDays: Object.fromEntries(RETENTION_TYPES.map((type) => [type, DEFAULT_RETENTION_DAYS])) as Record<RetentionType, number>,
    documents: { maxFileSizeMb: DEFAULT_DOCUMENT_MAX_MB, allowedTypes: [...DOCUMENT_TYPE_CATEGORIES] },
}

const legalText = (label: string) => z.string().trim().min(1, `Informe ${label}`).max(LEGAL_TEXT_MAX, `${label} excede ${LEGAL_TEXT_MAX.toLocaleString("pt-BR")} caracteres`)

export const legalPublishSchema = z.strictObject({
    termsOfUse: legalText("os termos de uso"),
    privacyPolicy: legalText("a política de privacidade"),
    notes: z.string().trim().max(500, "Use no máximo 500 caracteres").default(""),
})
export type LegalPublishInput = z.input<typeof legalPublishSchema>

export const legalAcceptSchema = z.strictObject({ version: z.number().int().positive("Versão inválida") })
