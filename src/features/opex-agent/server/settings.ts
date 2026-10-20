import { z } from "zod"
import { DomainError } from "@/lib/api/route"
import { assertCatalog, availability, loadFeature, persistFeature } from "@/features/ai/server/settings"
import type { AiFeatureAvailability } from "@/features/ai/types"
import { getAiProvider } from "@/lib/ai/providers"
import { OPEX_FEATURE, OPEX_TOOL_GROUPS, type OpexToolGroup } from "../constants"
import { DEFAULT_OPEX_AGENT_SETTINGS, opexAgentSettingsSchema, type OpexAgentSettings, type OpexMainModel, type OpexTitleModel } from "../schemas"
import { disabledOpexToolNames, enabledOpexToolNames, isOpexToolName, OPEX_TOOL_CATALOG } from "../tool-catalog"
import type { OpexAgentSettingsDto, OpexStatusDto } from "../types"

export async function loadOpexSettings(): Promise<{ settings: OpexAgentSettings; isDefault: boolean; updatedAt: Date | null }> {
    // Configurações salvas antes de um campo novo existir recebem o padrão dele antes de validar.
    return loadFeature<OpexAgentSettings>(OPEX_FEATURE, z.preprocess(withDefaults, opexAgentSettingsSchema), DEFAULT_OPEX_AGENT_SETTINGS)
}

/** Completa a configuração salva com os padrões dos campos novos (ferramentas novas nascem ligadas). */
export function withDefaults(saved: unknown): unknown {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return saved
    const value = saved as Partial<OpexAgentSettings>
    return {
        ...DEFAULT_OPEX_AGENT_SETTINGS,
        ...value,
        // Nomes que saíram do catálogo deixam de contar.
        disabledTools: (Array.isArray(value.disabledTools) ? value.disabledTools : []).filter((name) => typeof name === "string" && isOpexToolName(name)),
        files: { ...DEFAULT_OPEX_AGENT_SETTINGS.files, ...(value.files ?? {}) },
    }
}

export async function opexAvailability(settings: OpexAgentSettings): Promise<AiFeatureAvailability> {
    return availability({ enabled: settings.enabled, provider: settings.main.provider, model: settings.main.model }, '"Agente Opex"')
}

function toolCounts(): Record<OpexToolGroup, number> {
    return Object.fromEntries(OPEX_TOOL_GROUPS.map((group) => [group, OPEX_TOOL_CATALOG.filter((tool) => tool.group === group).length])) as Record<OpexToolGroup, number>
}

export async function getOpexSettings(): Promise<OpexAgentSettingsDto> {
    const { settings, isDefault, updatedAt } = await loadOpexSettings()
    return { settings, isDefault, availability: await opexAvailability(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null, toolCounts: toolCounts() }
}

/** O que o painel do chat precisa (sem instruções nem a lista de ferramentas). */
export async function getOpexStatus(): Promise<OpexStatusDto> {
    const { settings } = await loadOpexSettings()
    const status = await opexAvailability(settings)
    const main = settings.main
    return {
        available: status.available,
        reason: status.reason,
        modelLabel: main.provider && main.model ? `${getAiProvider(main.provider).name} · ${main.model}` : null,
        files: settings.files,
    }
}

function normalizeMain(main: OpexMainModel): OpexMainModel {
    const supportsSampling = main.provider ? getAiProvider(main.provider).supportsSampling : false
    return {
        ...main,
        variant: main.variant || null,
        temperature: supportsSampling ? main.temperature : null,
        maxOutputTokens: supportsSampling ? main.maxOutputTokens : null,
    }
}

function normalizeTitle(title: OpexTitleModel): OpexTitleModel {
    if (!title.provider) return { provider: null, model: null, variant: null }
    return { ...title, variant: title.variant || null }
}

export function normalizeOpexSettings(input: OpexAgentSettings): OpexAgentSettings {
    const unknown = input.disabledTools.filter((name) => !isOpexToolName(name))
    if (unknown.length) throw new DomainError(400, `Ferramenta(s) fora do catálogo: ${unknown.join(", ")}`, "OPEX_TOOL_UNKNOWN")
    // Normaliza pelo catálogo: sem duplicadas e sem as sempre ligadas.
    const disabledTools = disabledOpexToolNames(enabledOpexToolNames(input.disabledTools))
    return { ...input, main: normalizeMain(input.main), title: normalizeTitle(input.title), disabledTools }
}

/** Salva conferindo no catálogo os modelos e variantes do agente e do subagente de título. */
export async function saveOpexSettings(input: OpexAgentSettings, actorId: string): Promise<OpexAgentSettingsDto> {
    const next = normalizeOpexSettings(input)
    await assertCatalog({ enabled: next.enabled, provider: next.main.provider, model: next.main.model, variant: next.main.variant, agent: null, temperature: null, maxOutputTokens: null })
    if (next.title.provider) {
        await assertCatalog({ enabled: next.enabled, provider: next.title.provider, model: next.title.model, variant: next.title.variant, agent: null, temperature: null, maxOutputTokens: null })
    }
    const before = await loadOpexSettings()
    await persistFeature(OPEX_FEATURE, next, actorId, before)
    return getOpexSettings()
}
