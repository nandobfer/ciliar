import mongoose, { type ClientSession, type Connection } from "mongoose"
import { expandPermissions, readViewAs, resolveViewAs, getUnassignableRoles, canManageUser } from "@nandobfer/perfix"
import { dbConnect } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { catalog, can, normalizeRolePermissions } from "../catalog"
import { accessModels } from "./models"
import type { AccessContext } from "./context"
import type { RoleDto } from "../types"
import { currentLegalVersion } from "@/features/platform/server/state"

export const denied = (message = "Você não tem permissão para esta operação.", code = "FORBIDDEN") => new DomainError(403, message, code)
export const conflict = () => new DomainError(409, "Os acessos foram alterados. Recarregue e revise antes de salvar.", "VERSION_CONFLICT")
export function requirePermissions(context: AccessContext, ...keys: string[]) {
    if (!keys.every(key => can(context.effective, key))) throw denied()
}

export async function roleRows(session: ClientSession | null = null, connection = mongoose.connection): Promise<RoleDto[]> {
    const models = accessModels(connection)
    const rows = await models.roles.find().session(session).sort({ createdAt: 1, _id: 1 })
    const state = await models.states.findById("global").session(session)
    const order = new Map((state?.ordem ?? []).map((id, index) => [id, index + 1]))
    return rows.map((row, index) => ({
        id: row.id as string, slug: row.slug, nome: row.nome, descricao: row.descricao, cor: row.cor,
        permissoes: normalizeRolePermissions(catalog.sanitizePermissions(row.permissoes)), ativo: row.ativo, escopos: [], limiteNegocios: row.limiteNegocios ?? null,
        posicao: row.slug === "admin" ? 0 : order.get(row.id as string) ?? rows.length + index + 1,
        version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
        createdBy: row.createdBy, updatedBy: row.updatedBy,
    })).sort((a, b) => a.posicao - b.posicao)
}

export async function resolveAccess(userId: string, viewAsHeader = "none", session: ClientSession | null = null, expectedVersion?: number): Promise<AccessContext> {
    const { users } = accessModels()
    if (!mongoose.isObjectIdOrHexString(userId)) throw new DomainError(401, "Sessão inválida", "UNAUTHORIZED")
    const user = await users.findById(userId).session(session)
    if (!user?.active || (expectedVersion !== undefined && user.sessionVersion !== expectedVersion)) throw new DomainError(401, "Sessão expirada", "UNAUTHORIZED")
    const [rows, legalVersion] = await Promise.all([roleRows(session), currentLegalVersion(session)])
    const realRoles = rows.filter(row => user.roles.includes(row.id))
    const realEffective = expandPermissions(realRoles)
    const parsed = readViewAs({ header: viewAsHeader })
    if (parsed.invalid) throw denied("Simulação inválida. Saia da simulação.", "VIEW_AS_INVALID")
    const result = await resolveViewAs({
        real: { userId, nome: user.name, effective: realEffective }, viewAs: parsed.viewAs,
        loadRole: async id => rows.find(row => row.id === id && row.ativo) ?? null,
        loadTarget: async id => {
            if (!mongoose.isObjectIdOrHexString(id)) return null
            const target = await users.findById(id).session(session)
            return target ? { id, nome: target.name, ativo: target.active, roles: rows.filter(row => target.roles.includes(row.id)) } : null
        },
    })
    if (result.status === "forbidden") throw denied("Somente administradores reais podem simular acesso.", "VIEW_AS_FORBIDDEN")
    if (result.status === "invalid") throw denied("Perfil ou usuário simulado indisponível.", "VIEW_AS_INVALID")
    const simulatedIds = result.status === "ok" ? new Set(result.subject.roles.map(role => role.id)) : null
    const roles = simulatedIds ? rows.filter(row => simulatedIds.has(row.id)) : realRoles
    const effective = result.status === "ok" ? result.effective : realEffective
    return {
        userId, name: user.name, sessionVersion: user.sessionVersion,
        // Sem versão publicada ninguém é bloqueado; publicada, vale a do usuário real (nunca a do alvo simulado).
        legalVersion, legalAcceptanceRequired: legalVersion > 0 && user.legalAcceptance?.version !== legalVersion,
        roles, realRoles, effective, realEffective, viewAsHeader,
        dto: { permissions: [...effective], roles, realIsAdministrator: realEffective.has("*"), simulation: result.status === "ok" ? result.marker : null },
    }
}

export async function assertTransactionTopology(connection: Connection = mongoose.connection) {
    const hello = await connection.db!.command({ hello: 1 })
    if (!hello.setName && hello.msg !== "isdbgrid") throw new DomainError(503, "A administração de acessos exige MongoDB com replica set. Nenhuma alteração foi aplicada.", "REPLICA_SET_REQUIRED")
}

/** Fence compartilhado impede write skew (inclusive remoções simultâneas do último admin). */
export async function authorityTransaction<T>(initial: AccessContext, permissions: string[], action: (context: AccessContext, session: ClientSession) => Promise<T>): Promise<T> {
    requirePermissions(initial, "admin.access", ...permissions)
    await dbConnect()
    await assertTransactionTopology()
    const models = accessModels()
    await Promise.all(Object.values(models).map(model => model.init()))
    await models.states.updateOne({ _id: "global" }, { $setOnInsert: { ordem: [], version: 0, fence: 0 } }, { upsert: true })
    return mongoose.connection.transaction(async session => {
        await models.states.updateOne({ _id: "global" }, { $inc: { fence: 1 } }, { session })
        const current = await resolveAccess(initial.userId, initial.viewAsHeader, session, initial.sessionVersion)
        if (current.legalAcceptanceRequired) throw denied("Aceite os termos de uso e a política de privacidade para continuar.", "TERMS_ACCEPTANCE_REQUIRED")
        requirePermissions(current, "admin.access", ...permissions)
        return action(current, session)
    }, { readPreference: "primary", writeConcern: { w: "majority" }, maxCommitTimeMS: 10000 })
}

export async function auditAccess(context: Pick<AccessContext, "userId" | "dto">, action: string, targetId: string, before: unknown, after: unknown, session?: ClientSession) {
    await accessModels().audits.create([{ actorId: context.userId, action, targetId, before, after, simulation: context.dto.simulation }], { session })
}

export async function userRows(context: AccessContext) {
    const roles = await roleRows()
    return (await accessModels().users.find().select("+googleSub").sort({ name: 1, _id: 1 })).map(user => {
        const cargos = roles.filter(role => user.roles.includes(role.id))
        return { id: user.id as string, nome: user.name, email: user.email, ativo: user.active, version: user.accessVersion, cargos,
            roleIds: [...user.roles], gerenciavel: cargos.length === user.roles.length && canManageUser(context.roles, cargos),
            convitePendente: !user.googleSub, ultimoAcesso: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
            termosAceitos: user.legalAcceptance?.version ?? null }
    })
}

export async function assignableRoles(context: AccessContext) {
    const roles = (await roleRows()).filter(role => role.ativo)
    const blocked = new Map(getUnassignableRoles(catalog, context.roles, roles).map(role => [role.id, role.motivo]))
    return roles.map(role => ({ ...role, bloqueado: blocked.has(role.id), motivo: blocked.get(role.id) }))
}
