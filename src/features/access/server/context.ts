import { AsyncLocalStorage } from "node:async_hooks"
import type { RoleDto, AccessDto } from "../types"

export interface AccessContext {
    userId: string; name: string; sessionVersion: number;
    /** O usuário real ainda não aceitou a versão vigente dos termos/política (bloqueia toda API, exceto a própria conta). */
    legalAcceptanceRequired: boolean; legalVersion: number;
    roles: RoleDto[]; realRoles: RoleDto[]; effective: ReadonlySet<string>; realEffective: ReadonlySet<string>;
    dto: AccessDto; viewAsHeader: string;
}
export const requestAccess = new AsyncLocalStorage<AccessContext>()
export function currentAccess() {
    const context = requestAccess.getStore()
    if (!context) throw new Error("Operação sem contexto de acesso autenticado")
    return context
}
