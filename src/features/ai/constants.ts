/** Constantes das features de IA (módulo puro), copiadas do Opex. */

import type { AiProviderId } from "@/lib/ai/providers"

/** Abas da página "Provedores de IA". `provedores` é a padrão (omitida da URL). */
export const AI_TABS = ["provedores", "agente-opex", "agente-entrevistador", "resumo"] as const
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

// ── Memórias dos agentes ───────────────────────────────────────────────────────

export const AI_MEMORY_AUDIT_ENTITY = "MemoriaAgente"
/** Evento no canal da integração "Provedores de IA" quando as memórias de um agente mudam. Payload: `{ agentId }`. */
export const AI_MEMORIES_UPDATED_EVENT = "ai-memories-updated"
export const AGENT_MEMORY_LIMIT = 50

// ── Resumo ───────────────────────────────────────────────────────────────────

/** Uso "Resumo" em `ai_feature_settings`: formata e resume as memórias dos agentes. */
export const SUMMARY_FEATURE = "summary"
export const SUMMARY_CONSUMPTION_ORIGIN = "summary"
export const SUMMARY_MAX_LENGTH_MIN = 40
export const SUMMARY_MAX_LENGTH_MAX = 200
export const SUMMARY_MAX_LENGTH_DEFAULT = 80

export const DEFAULT_SUMMARY_INSTRUCTIONS = `Você organiza instruções e memórias dos agentes de IA do Ciliar.
- Corrija ortografia e pontuação, deixe o texto claro e direto, em português do Brasil, sem mudar o sentido nem acrescentar fatos.
- Escreva um resumo de UMA linha, curto, que identifique a memória numa lista.`
