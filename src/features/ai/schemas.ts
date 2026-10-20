import { z } from "zod"
import { opexMainModelSchema } from "@/features/opex-agent/schemas"
import { DEFAULT_SUMMARY_INSTRUCTIONS, SUMMARY_MAX_LENGTH_DEFAULT, SUMMARY_MAX_LENGTH_MAX, SUMMARY_MAX_LENGTH_MIN } from "./constants"

/**
 * Uso "Resumo" (formata e resume as memórias dos agentes) — mesmo schema na tela e na API. Copiado do
 * crm-marketing-campanhas; o provedor/modelo fica em `main`, no formato do cartão de modelo do Ciliar.
 */
export const summaryFeatureSchema = z
    .object({
        enabled: z.boolean(),
        main: opexMainModelSchema,
        instructions: z.string().trim().min(1, "Informe as instruções").max(8000, "Até 8.000 caracteres"),
        maxLength: z
            .number({ error: "Informe um número" })
            .int("Use um número inteiro")
            .min(SUMMARY_MAX_LENGTH_MIN, `Mínimo ${SUMMARY_MAX_LENGTH_MIN}`)
            .max(SUMMARY_MAX_LENGTH_MAX, `Máximo ${SUMMARY_MAX_LENGTH_MAX}`),
    })
    .superRefine((value, ctx) => {
        if (!value.enabled) return
        if (!value.main.provider) ctx.addIssue({ code: "custom", path: ["main", "provider"], message: "Selecione o provedor" })
        if (!value.main.model) ctx.addIssue({ code: "custom", path: ["main", "model"], message: "Selecione o modelo" })
    })

export type SummaryFeatureSettings = z.infer<typeof summaryFeatureSchema>

export const DEFAULT_SUMMARY_FEATURE: SummaryFeatureSettings = {
    enabled: false,
    main: { provider: null, model: null, variant: null, temperature: null, maxOutputTokens: null },
    instructions: DEFAULT_SUMMARY_INSTRUCTIONS,
    maxLength: SUMMARY_MAX_LENGTH_DEFAULT,
}

/** Memória de um agente: o texto livre é formatado pelo Resumo antes de salvar. */
export const MEMORY_TEXT_MAX = 2000
export const memoryInputSchema = z.object({
    texto: z.string().trim().min(3, "Escreva a memória").max(MEMORY_TEXT_MAX, "Até 2.000 caracteres"),
})
export type MemoryInput = z.infer<typeof memoryInputSchema>
