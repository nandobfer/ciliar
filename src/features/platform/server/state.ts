import type { ClientSession } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { PLATFORM_SETTINGS_ID, RETENTION_TYPES } from "../constants"
import { DEFAULT_PLATFORM_SETTINGS, platformSettingsSchema, type PlatformSettings } from "../schemas"
import { platformModels, type PlatformSettingsRecord } from "./models"

/**
 * Estado bruto da plataforma, sem dependência dos comandos de acesso (evita ciclo: os comandos de
 * perfis usam `assertNotDefaultRole` e o acesso usa `loadPlatformState` para os termos).
 */
export interface PlatformState {
    settings: PlatformSettings
    version: number
    legalVersion: number
    updatedAt: Date | null
}

/** Completa a configuração salva com os padrões (campos novos e prazos de tipos novos). */
export function withPlatformDefaults(record: Partial<PlatformSettingsRecord> | null): PlatformSettings {
    const retention = (record?.retentionDays ?? {}) as Partial<PlatformSettings["retentionDays"]>
    const merged = {
        defaultRoleId: record?.defaultRoleId ?? null,
        retentionDays: Object.fromEntries(RETENTION_TYPES.map((type) => [type, retention[type] ?? DEFAULT_PLATFORM_SETTINGS.retentionDays[type]])),
        documents: { ...DEFAULT_PLATFORM_SETTINGS.documents, ...(record?.documents ?? {}) },
    }
    const parsed = platformSettingsSchema.safeParse(merged)
    return parsed.success ? parsed.data : { ...DEFAULT_PLATFORM_SETTINGS, defaultRoleId: merged.defaultRoleId }
}

export async function loadPlatformState(session: ClientSession | null = null): Promise<PlatformState> {
    const record = await platformModels().settings.findById(PLATFORM_SETTINGS_ID).session(session).lean()
    return { settings: withPlatformDefaults(record), version: record?.version ?? 0, legalVersion: record?.legalVersion ?? 0, updatedAt: record?.updatedAt ?? null }
}

/** Versão vigente dos termos/política (0 = nenhuma publicada). */
export async function currentLegalVersion(session: ClientSession | null = null): Promise<number> {
    const record = await platformModels().settings.findById(PLATFORM_SETTINGS_ID).select({ legalVersion: 1 }).session(session).lean()
    return record?.legalVersion ?? 0
}

/** Garante o singleton fora da transação (criar coleção/documento não disputa o fence). */
export async function ensurePlatformRecord() {
    const models = platformModels()
    await Promise.all([models.settings.init(), models.legal.init()])
    await models.settings.updateOne({ _id: PLATFORM_SETTINGS_ID }, { $setOnInsert: { ...DEFAULT_PLATFORM_SETTINGS, legalVersion: 0, version: 0 } }, { upsert: true })
}

/** Impede inativar/excluir o perfil que é o padrão do cadastro público (dentro da transação do perfil). */
export async function assertNotDefaultRole(roleId: string, session: ClientSession, action: "inativar" | "excluir") {
    const state = await loadPlatformState(session)
    if (state.settings.defaultRoleId === roleId) {
        throw new DomainError(409, `Não é possível ${action} o perfil padrão do cadastro público. Troque o perfil padrão em Integrações › Plataforma.`, "DEFAULT_ROLE_IN_USE")
    }
}
