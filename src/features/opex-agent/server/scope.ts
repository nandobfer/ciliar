import { DomainError } from "@/lib/api/route"
import { requirePermissions, resolveAccess } from "@/features/access/server/access"
import type { AccessContext } from "@/features/access/server/context"

/**
 * Escopo do Agente Opex no servidor (SOMENTE servidor): o usuário **real** autenticado, o marcador de
 * simulação ("Visualizar como") da requisição e a versão da sessão de login.
 *
 * O escopo nunca carrega permissões prontas: o acesso é revalidado no banco (`resolveAccess`) no início
 * do turno, **antes de cada ferramenta** e na confirmação. Conta inativa, logout/troca de senha
 * (versão da sessão), perfil alterado ou fim da simulação valem na hora, inclusive no meio do turno.
 * A identidade nunca é trocada: a simulação só reduz as permissões; sessões e auditoria são do ator real.
 */
export interface OpexServerScope {
    userId: string
    /** `x-perfix-view-as` da requisição que iniciou o turno (`none` sem simulação). */
    viewAsHeader: string
    sessionVersion: number
}

export function scopeOfAccess(access: AccessContext): OpexServerScope {
    return { userId: access.userId, viewAsHeader: access.viewAsHeader, sessionVersion: access.sessionVersion }
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
    if (access.mustChangePassword) throw new DomainError(403, "Troque sua senha para continuar", "PASSWORD_CHANGE_REQUIRED")
    requirePermissions(access, "admin.access", "opex.use")
    return access
}
