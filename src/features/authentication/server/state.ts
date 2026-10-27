import type { ClientSession } from "mongoose"
import { dbConnect } from "@/lib/db"
import { logger } from "@/lib/logger"
import { AUTH_SETTINGS_ID } from "../constants"
import { authSettingsSchema, DEFAULT_AUTH_SETTINGS, type AuthSettings } from "../schemas"
import { authSettingsModels, type AuthSettingsRecord } from "./models"

/**
 * Estado bruto da integração Autenticação, sem dependência dos comandos de acesso: é lido na tela de
 * login, na rota do Auth.js e na checagem de origem de toda mutação (`assertMutationOrigin`).
 */
export interface AuthSettingsState {
    settings: AuthSettings
    version: number
    updatedAt: Date | null
}

/** Configuração salva inválida (ou ausente) volta ao padrão: HTTP e HTTPS só com Google. */
export function withAuthDefaults(record: Partial<AuthSettingsRecord> | null): AuthSettings {
    if (!record) return DEFAULT_AUTH_SETTINGS
    const parsed = authSettingsSchema.safeParse({ methods: record.methods ?? DEFAULT_AUTH_SETTINGS.methods, extraHosts: record.extraHosts ?? [] })
    return parsed.success ? parsed.data : DEFAULT_AUTH_SETTINGS
}

export async function loadAuthSettings(session: ClientSession | null = null): Promise<AuthSettingsState> {
    const record = await authSettingsModels().settings.findById(AUTH_SETTINGS_ID).session(session).lean()
    return { settings: withAuthDefaults(record), version: record?.version ?? 0, updatedAt: record?.updatedAt ?? null }
}

/** Garante o singleton fora da transação (criar coleção/documento não disputa o fence). */
export async function ensureAuthSettingsRecord() {
    const { settings } = authSettingsModels()
    await settings.init()
    await settings.updateOne({ _id: AUTH_SETTINGS_ID }, { $setOnInsert: { ...DEFAULT_AUTH_SETTINGS, version: 0 } }, { upsert: true })
}

const CACHE_MS = 5_000
let cache: { settings: AuthSettings; expires: number } | null = null

/**
 * Configuração vigente com cache curto em memória (limpo ao salvar). Falha ao ler o banco cai no
 * padrão (só Google e só o host do `APP_ORIGIN`), sem guardar o erro em cache.
 */
export async function cachedAuthSettings(now = Date.now()): Promise<AuthSettings> {
    if (cache && cache.expires > now) return cache.settings
    try {
        await dbConnect()
        const { settings } = await loadAuthSettings()
        cache = { settings, expires: now + CACHE_MS }
        return settings
    } catch (error) {
        logger.warn({ err: error, action: "auth.settings" }, "Não foi possível ler a configuração de autenticação; usando o padrão")
        return DEFAULT_AUTH_SETTINGS
    }
}

export function invalidateAuthSettingsCache() {
    cache = null
}
