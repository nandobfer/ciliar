import { auditAccess, authorityTransaction, conflict } from "@/features/access/server/access"
import { parseInput } from "@/features/access/server/commands"
import type { AccessContext } from "@/features/access/server/context"
import { appOrigin, requestAuthContext } from "@/features/auth/server/origin"
import { AUTH_SETTINGS_ID } from "../constants"
import { authSettingsUpdateSchema } from "../schemas"
import type { AuthSettingsDto } from "../types"
import { authSettingsModels } from "./models"
import { ensureAuthSettingsRecord, invalidateAuthSettingsCache, loadAuthSettings } from "./state"

export const googleConfigured = () => !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET

/** Requisição da tela (protocolo/host atuais); o agente não tem requisição de navegador. */
export interface AuthRequestInfo { headers: Headers; url: string }

export async function getAuthSettings(_context: AccessContext, request?: AuthRequestInfo): Promise<AuthSettingsDto> {
    const state = await loadAuthSettings()
    let current: AuthSettingsDto["current"] = null
    if (request) {
        const { resolved, methods } = await requestAuthContext(request.headers, request.url)
        current = { protocol: resolved.protocol, host: resolved.host, allowed: resolved.allowed, methods }
    }
    return {
        settings: state.settings,
        version: state.version,
        updatedAt: state.updatedAt ? state.updatedAt.toISOString() : null,
        canonicalHost: new URL(appOrigin()).hostname,
        googleConfigured: googleConfigured(),
        current,
    }
}

/**
 * Salva os métodos por protocolo e os endereços de acesso adicionais. Decide quem consegue entrar
 * (segurança): transação com fence, versão otimista (409 sem sobrescrever) e auditoria. Cada
 * protocolo exige ao menos um método.
 */
export async function updateAuthSettings(context: AccessContext, raw: unknown, request?: AuthRequestInfo): Promise<AuthSettingsDto> {
    const { version, ...next } = parseInput(authSettingsUpdateSchema, raw)
    await ensureAuthSettingsRecord()
    await authorityTransaction(context, ["integrations.authentication.edit"], async (current, session) => {
        const before = await loadAuthSettings(session)
        if (before.version !== version) throw conflict()
        await authSettingsModels().settings.updateOne({ _id: AUTH_SETTINGS_ID, version }, { $set: { ...next, updatedBy: current.userId }, $inc: { version: 1 } }, { session })
        await auditAccess(current, "auth_settings.update", "authentication", before.settings, next, session)
    })
    invalidateAuthSettingsCache()
    return getAuthSettings(context, request)
}
