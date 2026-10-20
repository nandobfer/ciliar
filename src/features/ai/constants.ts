/** Constantes das features de IA (módulo puro), copiadas do Opex. */

import type { AiProviderId } from "@/lib/ai/providers"

/** Abas da página "Provedores de IA". `provedores` é a padrão (omitida da URL). */
export const AI_TABS = ["provedores", "agente-opex"] as const
export type AiTab = (typeof AI_TABS)[number]

export const AI_PROVIDER_TABS = ["configuracao", "modelos", "consumo"] as const
export type AiProviderTab = (typeof AI_PROVIDER_TABS)[number]

/**
 * Abas da página de um provedor de IA (`/integracoes/ia/opencode`). `configuracao` é a padrão
 * (omitida da URL). Gemini, Anthropic, OpenAI e DeepSeek não têm consumo próprio medido aqui, então não
 * têm a aba Consumo.
 */
export const AI_PROVIDER_TAB_IDS: Record<AiProviderId, readonly AiProviderTab[]> = {
    opencode: ["configuracao", "modelos", "consumo"],
    gemini: ["configuracao", "modelos"],
    anthropic: ["configuracao", "modelos"],
    openai: ["configuracao", "modelos"],
    deepseek: ["configuracao", "modelos"],
    jev: ["configuracao", "modelos", "consumo"],
}

export const AI_AUDIT_ENTITY = "FeatureIA"

/** Evento em `private-app` quando a configuração de uma feature muda. Payload: `{ feature }`. */
export const AI_FEATURE_UPDATED_EVENT = "ai-feature-updated"
