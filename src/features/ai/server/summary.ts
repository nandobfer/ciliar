import { streamAi } from "@/lib/ai/stream"
import { getAiProvider } from "@/lib/ai/providers"
import { SUMMARY_CONSUMPTION_ORIGIN, SUMMARY_FEATURE } from "../constants"
import { DEFAULT_SUMMARY_FEATURE, summaryFeatureSchema, type SummaryFeatureSettings } from "../schemas"
import { buildSummaryInstructions, fallbackSummary, normalizeText, parseFormattedMemory, type FormattedMemory } from "../summary"
import type { AiFeatureAvailability, SummaryFeatureDto } from "../types"
import { assertCatalog, availability, loadFeature, persistFeature } from "./settings"

/** Uso "Resumo" (SOMENTE servidor), copiado do crm-marketing-campanhas. */

export function loadSummarySettings() {
    return loadFeature<SummaryFeatureSettings>(SUMMARY_FEATURE, summaryFeatureSchema, DEFAULT_SUMMARY_FEATURE)
}

export function summaryAvailability(settings: SummaryFeatureSettings): Promise<AiFeatureAvailability> {
    return availability({ enabled: settings.enabled, provider: settings.main.provider, model: settings.main.model }, 'O "Resumo"')
}

export async function getSummarySettings(): Promise<SummaryFeatureDto> {
    const { settings, isDefault, updatedAt } = await loadSummarySettings()
    return { settings, isDefault, availability: await summaryAvailability(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null }
}

export async function saveSummarySettings(input: SummaryFeatureSettings, actorId: string): Promise<SummaryFeatureDto> {
    const supportsSampling = input.main.provider ? getAiProvider(input.main.provider).supportsSampling : false
    const next: SummaryFeatureSettings = {
        ...input,
        main: { ...input.main, variant: input.main.variant || null, temperature: supportsSampling ? input.main.temperature : null, maxOutputTokens: supportsSampling ? input.main.maxOutputTokens : null },
    }
    await assertCatalog({ enabled: next.enabled, provider: next.main.provider, model: next.main.model, variant: next.main.variant, agent: null, temperature: null, maxOutputTokens: null })
    const before = await loadSummarySettings()
    await persistFeature(SUMMARY_FEATURE, next, actorId, before)
    return getSummarySettings()
}

/**
 * Formata o texto livre de uma memória e gera o resumo de uma linha mostrado nas listas. Nunca
 * lança: sem IA (desligada, indisponível ou falha), salva o texto como escrito e um resumo de
 * reserva — e avisa quem chamou (`formatadaPorIa: false`).
 */
export async function formatMemory(texto: string): Promise<FormattedMemory & { formatadaPorIa: boolean }> {
    const { settings } = await loadSummarySettings()
    const original = normalizeText(texto)
    const fallback = { texto: original, resumo: fallbackSummary(original, settings.maxLength), formatadaPorIa: false }
    const status = await summaryAvailability(settings).catch(() => ({ available: false }))
    const { provider, model, variant, temperature, maxOutputTokens } = settings.main
    if (!status.available || !provider || !model) return fallback
    let text = ""
    let failed = false
    const signal = AbortSignal.timeout(30_000)
    try {
        for await (const event of streamAi({
            provider,
            model,
            variant,
            temperature,
            maxOutputTokens,
            instructions: buildSummaryInstructions(settings.instructions, settings.maxLength),
            prompt: `Memória:\n${original}`,
            signal,
            consumption: { origin: SUMMARY_CONSUMPTION_ORIGIN },
        })) {
            if (event.type === "delta") text += event.text
            if (event.type === "error") failed = true
        }
    } catch {
        failed = true
    }
    if (failed) return fallback
    const parsed = parseFormattedMemory(text, settings.maxLength)
    return parsed ? { ...parsed, formatadaPorIa: true } : fallback
}
