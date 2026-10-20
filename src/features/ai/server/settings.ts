import type { ZodType } from "zod"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { AiFeatureSetting } from "@/lib/db/models/Ai"
import { DomainError } from "@/lib/api/route"
import { getAiProviderStatuses, listAiAgents, listAiModels } from "@/lib/ai/catalog"
import { AiProviderError } from "@/lib/ai/errors"
import { getAiProvider, type AiProviderId } from "@/lib/ai/providers"
import { integrationChannel, publishToChannels } from "@/lib/pusher/channels"
import { AI_AUDIT_ENTITY, AI_FEATURE_UPDATED_EVENT } from "../constants"
import type { AiFeatureAvailability } from "../types"

/** Base das features de IA (copiada do Opex): carregar, disponibilidade, catálogo e gravação. */

/** Campos de provedor comuns a toda feature de IA. */
export type ProviderSettings = {
    enabled: boolean
    provider: AiProviderId | null
    model: string | null
    agent: string | null
    variant: string | null
    temperature: number | null
    maxOutputTokens: number | null
}

/** Configuração salva (validada); inválida ou ausente cai nos valores iniciais. */
export async function loadFeature<T>(feature: string, schema: ZodType<T>, defaults: T): Promise<{ settings: T; isDefault: boolean; updatedAt: Date | null }> {
    await dbConnect()
    const doc = await AiFeatureSetting.findOne({ feature }).lean()
    if (!doc) return { settings: defaults, isDefault: true, updatedAt: null }
    const parsed = schema.safeParse({ ...defaults, ...doc.settings })
    return { settings: parsed.success ? parsed.data : defaults, isDefault: !parsed.success, updatedAt: doc.updatedAt ?? null }
}

/** Pode ser usada agora? Sem `available`, `reason` explica (botão desabilitado com o motivo). */
export async function availability(settings: Pick<ProviderSettings, "enabled" | "provider" | "model">, featureLabel: string): Promise<AiFeatureAvailability> {
    if (!settings.enabled) return { available: false, reason: `${featureLabel} está desativada em Integrações › Provedores de IA` }
    if (!settings.provider || !settings.model) return { available: false, reason: "Selecione o provedor e o modelo em Integrações › Provedores de IA" }
    const status = (await getAiProviderStatuses()).find((item) => item.id === settings.provider)
    if (!status?.configured) return { available: false, reason: `${getAiProvider(settings.provider).name} não está configurado` }
    if (!status.connected) return { available: false, reason: `${getAiProvider(settings.provider).name} não está conectado: teste a conexão em Integrações › Provedores de IA` }
    return { available: true, reason: null }
}

/** Confere no provedor o modelo, a variante e o agente escolhidos. */
export async function assertCatalog(settings: ProviderSettings): Promise<void> {
    if (!settings.provider || !settings.model) return
    const provider = getAiProvider(settings.provider)
    const status = (await getAiProviderStatuses()).find((item) => item.id === settings.provider)
    if (!status?.connected) {
        if (settings.enabled) throw new DomainError(409, `${provider.name} não está conectado: teste a conexão antes de ativar a feature`, "AI_PROVIDER_DISCONNECTED")
        return
    }
    try {
        const models = await listAiModels(settings.provider)
        const model = models.find((item) => item.id === settings.model)
        if (!model) throw new DomainError(400, `Modelo ${settings.model} não está disponível no ${provider.name}`, "AI_MODEL_NOT_FOUND")
        if (settings.variant && !model.variants.includes(settings.variant)) throw new DomainError(400, `${provider.variantLabel} "${settings.variant}" não existe no modelo ${model.name}`, "AI_VARIANT_NOT_FOUND")
        if (provider.supportsAgent && settings.agent) {
            const agents = await listAiAgents()
            if (!agents.some((agent) => agent.id === settings.agent)) throw new DomainError(400, `Agente ${settings.agent} não existe no OpenCode`, "AI_AGENT_NOT_FOUND")
        }
    } catch (error) {
        if (error instanceof AiProviderError) throw new DomainError(502, error.message, "AI_PROVIDER_ERROR")
        throw error
    }
}

export async function persistFeature<T>(feature: string, next: T, actorId: string, before: { isDefault: boolean; settings: T }): Promise<void> {
    await AiFeatureSetting.updateOne({ feature }, { $set: { settings: next, updatedAt: new Date(), updatedBy: actorId } }, { upsert: true })
    await recordAudit({
        userId: actorId,
        entidade: AI_AUDIT_ENTITY,
        entidadeId: feature,
        acao: before.isDefault ? AcaoAuditoria.CRIAR : AcaoAuditoria.ATUALIZAR,
        antes: before.isDefault ? undefined : (before.settings as Record<string, unknown>),
        depois: next as Record<string, unknown>,
    })
    // Só invalidação: quem recebe relê a configuração pela API reautorizada.
    await publishToChannels([integrationChannel("ai")], AI_FEATURE_UPDATED_EVENT, { feature }).catch(() => undefined)
}
