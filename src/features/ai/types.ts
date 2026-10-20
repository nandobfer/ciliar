export type { AiAgentDto, AiModelDto, AiProviderStatusDto } from "@/lib/ai/providers"

/** Pode ser usada agora? Sem `available`, `reason` explica (botão desabilitado com o motivo). */
export interface AiFeatureAvailability {
    available: boolean
    reason: string | null
}

/** Memória exibida na lista compacta de um agente. */
export interface MemoryDto {
    id: string
    texto: string
    resumo: string
    /** Mantido do crm (lá, memórias do contato); no Ciliar toda memória é escrita por um usuário. */
    origem?: "agente" | "usuario"
    autor: string | null
    criadaEm: string
    atualizadaEm: string
}

export interface MemoryMutationResult {
    memoria: MemoryDto
    /** `false` quando o Resumo estava indisponível e o texto foi salvo como escrito. */
    formatadaPorIa: boolean
}

export interface SummaryFeatureDto {
    settings: import("./schemas").SummaryFeatureSettings
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
}
