import { DomainError } from "@/lib/api/route"
import { requirePermissions, resolveAccess } from "@/features/access/server/access"
import type { AccessContext } from "@/features/access/server/context"

/**
 * Escopo do Agente Opex no servidor (SOMENTE servidor): o usuário **real** autenticado, o marcador de
 * simulação ("Visualizar como") da requisição e a versão da sessão de login.
 *
 * O escopo nunca carrega permissões prontas: o acesso é revalidado no banco (`resolveAccess`) no início
 * do turno, **antes de cada ferramenta** e na confirmação. Conta inativa, logout (versão da sessão),
 * nova versão dos termos sem aceite, perfil alterado ou fim da simulação valem na hora, inclusive no meio do turno.
 * A identidade nunca é trocada: a simulação só reduz as permissões; sessões e auditoria são do ator real.
 */
export interface OpexServerScope {
    userId: string
    /** `x-perfix-view-as` da requisição que iniciou o turno (`none` sem simulação). */
    viewAsHeader: string
    sessionVersion: number
    /** Fuso do navegador da requisição que iniciou o turno (períodos das metas). */
    timeZone?: string
}

export function scopeOfAccess(access: AccessContext): OpexServerScope {
    return { userId: access.userId, viewAsHeader: access.viewAsHeader, sessionVersion: access.sessionVersion, ...(access.timeZone ? { timeZone: access.timeZone } : {}) }
}

export function actorIdOf(scope: OpexServerScope): string {
    return scope.userId
}

/** Sessões visíveis: só as do próprio usuário real. */
export function sessionFilterOf(scope: OpexServerScope): Record<string, unknown> {
    return { userId: scope.userId }
}

/** Relê o acesso do escopo e confere que o chat continua liberado. */
export async function resolveScopeAccess(scope: OpexServerScope): Promise<AccessContext> {
    const access = await resolveAccess(scope.userId, scope.viewAsHeader, null, scope.sessionVersion)
    if (access.legalAcceptanceRequired) throw new DomainError(403, "Aceite os termos de uso e a política de privacidade para continuar", "TERMS_ACCEPTANCE_REQUIRED")
    // Sem `admin.access`: o prestador (perfil sem painel) também conversa; cada ferramenta exige as próprias permissões.
    requirePermissions(access, "opex.use")
    return access
}
