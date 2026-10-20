import { requestAccess, type AccessContext } from "@/features/access/server/context"

export function accessFixture(keys = ["*"]): AccessContext {
    const effective = new Set(keys)
    return { userId: "a".repeat(24), name: "Ator de teste", sessionVersion: 0, legalAcceptanceRequired: false, legalVersion: 0, roles: [], realRoles: [], effective, realEffective: effective, viewAsHeader: "none", dto: { permissions: keys, roles: [], realIsAdministrator: effective.has("*"), simulation: null } }
}
export function asAdministrator<T>(action: () => T): T { return requestAccess.run(accessFixture(), action) }
