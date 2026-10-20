/**
 * Agentes de IA do Ciliar que têm memórias (módulo PURO: tela e servidor). Um agente novo entra
 * aqui e ganha, sem código novo, o card "Memórias" na aba dele, a API, as ferramentas do Agente Opex
 * (`agent`) e as memórias no prompt (o runner do agente chama `agentMemoryTexts`).
 */

export const AI_AGENT_IDS = ["opex-agent", "business-interviewer"] as const
export type AiAgentId = (typeof AI_AGENT_IDS)[number]

export const AI_AGENTS: Record<AiAgentId, { label: string; tab: string }> = {
    "opex-agent": { label: "Agente Opex", tab: "agente-opex" },
    "business-interviewer": { label: "Agente Entrevistador", tab: "agente-entrevistador" },
}

export function isAiAgentId(value: string): value is AiAgentId {
    return (AI_AGENT_IDS as readonly string[]).includes(value)
}
