import { z } from "zod"
import { ITEM_DESCRIPTION_MAX } from "@/features/businesses/constants"
import { portfolioBlocksSchema } from "./blocks"
import { PORTFOLIO_ITEM_IMAGES_MAX, PORTFOLIO_ITEM_TAG_MAX, PORTFOLIO_ITEM_TAGS_MAX, PORTFOLIO_ITEM_TITLE_MAX, PORTFOLIO_ITEM_URL_MAX } from "./constants"
import { normalizeTags, slugProblem, SLUG_PROBLEM_MESSAGES } from "./logic"
import { PORTFOLIO_TEMPLATES } from "./templates"

/** Entradas do portfólio (M5) — mesmas regras na tela, na API e no Agente Opex. */

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Id inválido")
const version = z.number().int().nonnegative()
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")

export const portfolioSlugSchema = z
    .string({ error: "Informe o endereço" })
    .trim()
    .toLowerCase()
    .superRefine((value, context) => {
        const problem = slugProblem(value)
        if (problem) context.addIssue({ code: "custom", message: SLUG_PROBLEM_MESSAGES[problem] })
    })

/** `version` = configuração/publicação; `draftVersion` = rascunho dos blocos (salvamento automático). */
export const portfolioVersionSchema = z.strictObject({ version })
export const portfolioSlugUpdateSchema = z.strictObject({ slug: portfolioSlugSchema, version })
export const portfolioSettingsSchema = z.strictObject({ indexable: z.boolean(), version })
export const portfolioDraftSaveSchema = z.strictObject({ blocks: portfolioBlocksSchema, draftVersion: version })
export type PortfolioDraftSaveInput = z.infer<typeof portfolioDraftSaveSchema>
export const portfolioDraftVersionSchema = z.strictObject({ draftVersion: version })
export const portfolioPublishChangesSchema = z.strictObject({ draftVersion: version, version, publishPage: z.boolean().default(false) })
export const portfolioTemplateSchema = z.strictObject({ template: z.enum(PORTFOLIO_TEMPLATES), draftVersion: version })
export const portfolioMediaAddSchema = z.strictObject({ fileIds: z.array(objectId).min(1).max(20) })

// ── Itens avulsos ──────────────────────────────────────────────────────────

const title = z.string().trim().min(1, "Informe o título").max(PORTFOLIO_ITEM_TITLE_MAX, `Até ${PORTFOLIO_ITEM_TITLE_MAX} caracteres no título`)
const description = z.string().trim().max(ITEM_DESCRIPTION_MAX, `Até ${ITEM_DESCRIPTION_MAX.toLocaleString("pt-BR")} caracteres na descrição`).nullable().optional()
const url = z
    .string()
    .trim()
    .max(PORTFOLIO_ITEM_URL_MAX, `Até ${PORTFOLIO_ITEM_URL_MAX} caracteres no link`)
    .refine((value) => {
        if (!value) return true
        try {
            const parsed = new URL(value)
            return parsed.protocol === "https:" || parsed.protocol === "http:"
        } catch {
            return false
        }
    }, "Link inválido: use um endereço que comece com https://")
    .nullable()
    .optional()
const tags = z
    .array(z.string().trim().max(PORTFOLIO_ITEM_TAG_MAX, `Até ${PORTFOLIO_ITEM_TAG_MAX} caracteres por categoria/tag`))
    .transform(normalizeTags)
    .pipe(z.array(z.string()).max(PORTFOLIO_ITEM_TAGS_MAX, `Até ${PORTFOLIO_ITEM_TAGS_MAX} categorias/tags`))
const imageIds = z
    .array(objectId)
    .max(PORTFOLIO_ITEM_IMAGES_MAX, `Até ${PORTFOLIO_ITEM_IMAGES_MAX} imagens`)
    .refine((ids) => new Set(ids).size === ids.length, "Imagem repetida")

export const portfolioItemCreateSchema = z.strictObject({
    title,
    description,
    url,
    date: dateKey.nullable().optional(),
    tags: tags.default([]),
    imageIds: imageIds.default([]),
})
export type PortfolioItemCreateInput = z.infer<typeof portfolioItemCreateSchema>

export const portfolioItemUpdateSchema = z.strictObject({
    title: title.optional(),
    description,
    url,
    date: dateKey.nullable().optional(),
    tags: tags.optional(),
    /** Lista COMPLETA das imagens: as atuais que ficam + as novas enviadas, na ordem da galeria. */
    imageIds: imageIds.optional(),
    version,
})
