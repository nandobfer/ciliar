export type { AiAgentDto, AiModelDto, AiProviderStatusDto } from "@/lib/ai/providers"

/** Pode ser usada agora? Sem `available`, `reason` explica (botão desabilitado com o motivo). */
export interface AiFeatureAvailability {
    available: boolean
    reason: string | null
}
