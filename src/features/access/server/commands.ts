import type { ClientSession } from "mongoose"
import { canManageRole, canManageUser, evaluateRoleAssignment, getUngrantableKeys } from "@nandobfer/perfix"
import { z } from "zod"
import { DomainError } from "@/lib/api/route"
import { hashPassword } from "@/features/auth/server/password"
import { catalog } from "../catalog"
import { createUserSchema, updateUserSchema, roleSchema, roleUpdateSchema, reorderSchema } from "../schemas"
import { accessModels } from "./models"
import { auditAccess, authorityTransaction, conflict, denied, roleRows } from "./access"
import type { AccessContext } from "./context"

export function parseInput<T>(schema: z.ZodType<T>, raw: unknown): T {
    const result = schema.safeParse(raw)
    if (!result.success) throw new DomainError(400, result.error.issues.map(issue => issue.message).join(". "), "VALIDATION_ERROR")
    return result.data
}
const missing = () => new DomainError(404, "Registro não encontrado", "NOT_FOUND")

export async function createUser(context: AccessContext, raw: unknown) {
    const data = parseInput(createUserSchema, raw)
    // Autorizar antes de gastar recursos com Argon2.
    if (!context.effective.has("*") && !context.effective.has("users.create")) throw denied()
    const passwordHash = await hashPassword(data.password)
    try {
        return await authorityTransaction(context, ["users.create"], async (current, session) => {
            const rows = await roleRows(session)
            if (data.cargos.some(id => !rows.some(role => role.id === id && role.ativo))) throw new DomainError(400, "Perfil inexistente ou inativo")
            const assignment = evaluateRoleAssignment({ catalog, callerCargos: current.roles, requested: data.cargos, current: [], loaded: rows })
            if (assignment.status !== "ok") throw denied("Um ou mais perfis não podem ser atribuídos")
            const [user] = await accessModels().users.create([{ name: data.nome, email: data.email, passwordHash, active: data.ativo, roles: assignment.cargos, mustChangePassword: true }], { session })
            await auditAccess(current, "user.create", user!.id as string, null, { nome: data.nome, email: data.email, ativo: data.ativo, cargos: assignment.cargos }, session)
            return { id: user!.id as string }
        })
    } catch (error) {
        if (typeof error === "object" && error && "code" in error && error.code === 11000) throw new DomainError(409, "Já existe um usuário com esse e-mail. Nenhuma conta foi alterada.")
        throw error
    }
}

async function saveUser(context: AccessContext, id: string, data: z.infer<typeof updateUserSchema>, session: ClientSession) {
    const { users } = accessModels()
    const user = await users.findById(id).session(session)
    if (!user) throw missing()
    if (user.accessVersion !== data.version) throw conflict()
    const rows = await roleRows(session)
    const existing = rows.filter(row => user.roles.includes(row.id))
    if (existing.length !== user.roles.length || !canManageUser(context.roles, existing)) throw denied("Usuário fora do alcance da sua hierarquia")
    const changed = data.cargos.length !== user.roles.length || data.cargos.some(role => !user.roles.includes(role))
    if (id === context.userId && (changed || !data.ativo)) throw denied("Você não pode alterar seus próprios perfis nem desativar sua conta")
    const assignment = evaluateRoleAssignment({ catalog, callerCargos: context.roles, requested: data.cargos, current: user.roles, loaded: rows })
    if (assignment.status !== "ok") throw denied("Um ou mais perfis não podem ser atribuídos")
    const admin = rows.find(role => role.slug === "admin")
    if (admin && user.active && user.roles.includes(admin.id) && (!data.ativo || !assignment.cargos.includes(admin.id))) {
        if (await users.countDocuments({ active: true, roles: admin.id }).session(session) <= 1) throw new DomainError(409, "Não é permitido remover o último administrador ativo")
    }
    const before = { nome: user.name, ativo: user.active, cargos: [...user.roles] }
    user.name = data.nome; user.active = data.ativo; user.roles = assignment.cargos; user.accessVersion++
    if (!data.ativo) user.sessionVersion++
    await user.save({ session })
    await auditAccess(context, "user.update", id, before, { nome: data.nome, ativo: data.ativo, cargos: assignment.cargos }, session)
}
export const updateUser = (context: AccessContext, id: string, raw: unknown) => {
    const data = parseInput(updateUserSchema, raw)
    return authorityTransaction(context, ["users.edit"], async (current, session) => { await saveUser(current, id, data, session); return { id } })
}
export const deleteUser = (context: AccessContext, id: string, version: number) => authorityTransaction(context, ["users.delete"], async (current, session) => {
    if (current.userId === id) throw denied("Você não pode excluir sua própria conta")
    const { users } = accessModels()
    const user = await users.findById(id).session(session)
    if (!user) throw missing()
    if (user.accessVersion !== version) throw conflict()
    const rows = await roleRows(session)
    const roles = rows.filter(row => user.roles.includes(row.id))
    if (roles.length !== user.roles.length || !canManageUser(current.roles, roles)) throw denied()
    const admin = rows.find(row => row.slug === "admin")
    if (admin && user.active && user.roles.includes(admin.id) && await users.countDocuments({ active: true, roles: admin.id }).session(session) <= 1) throw new DomainError(409, "Não é permitido excluir o último administrador ativo")
    await auditAccess(current, "user.delete", id, { nome: user.name, email: user.email, cargos: user.roles }, null, session)
    await users.deleteOne({ _id: id }, { session })
    return { id }
})

export async function createRole(context: AccessContext, raw: unknown) {
    const data = parseInput(roleSchema, raw)
    return authorityTransaction(context, ["roles.edit"], async (current, session) => {
        if (!canManageRole(current.roles, { permissoes: [] }) || data.permissoes.includes("*") || getUngrantableKeys(current.effective, data.permissoes).length) throw denied()
        const slug = data.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        if (!slug || slug === "admin") throw new DomainError(400, "Nome de perfil reservado ou inválido")
        const models = accessModels()
        if (await models.roles.exists({ slug }).session(session)) throw new DomainError(409, "Já existe um perfil com esse nome")
        const rows = await roleRows(session)
        const [role] = await models.roles.create([{ ...data, slug, permissoes: catalog.normalizePermissionDependencies(data.permissoes), createdBy: current.userId }], { session })
        await models.states.updateOne({ _id: "global" }, { $set: { ordem: [...rows.map(row => row.id), role!.id as string] }, $inc: { version: 1 } }, { session })
        await auditAccess(current, "role.create", role!.id as string, null, data, session)
        return { id: role!.id as string }
    })
}

export async function updateRole(context: AccessContext, id: string, raw: unknown) {
    const { version, membros, ...data } = parseInput(roleUpdateSchema, raw)
    return authorityTransaction(context, ["roles.edit", ...(membros ? ["users.edit"] : [])], async (current, session) => {
        const { roles, users } = accessModels()
        const role = await roles.findById(id).session(session)
        if (!role) throw missing()
        if (role.version !== version) throw conflict()
        if (role.slug === "admin") {
            if (!current.effective.has("*") || Object.keys(data).some(key => !["nome", "descricao", "cor"].includes(key))) throw denied("Administrador permite alterar somente nome, descrição e cor")
        } else if (!canManageRole(current.roles, role) || data.permissoes?.includes("*") || getUngrantableKeys(current.effective, data.permissoes ?? []).length) throw denied()
        const before = { nome: role.nome, descricao: role.descricao, cor: role.cor, permissoes: [...role.permissoes], ativo: role.ativo }
        Object.assign(role, data, { updatedBy: current.userId, version: version + 1 })
        if (data.permissoes) role.permissoes = catalog.normalizePermissionDependencies(data.permissoes)
        await role.save({ session })
        if (membros) {
            const targets = await users.find({ $or: [{ roles: id }, { _id: { $in: membros } }] }).session(session)
            if (membros.some(member => !targets.some(target => target.id === member))) throw new DomainError(400, "Usuário não encontrado")
            for (const target of targets) {
                const selected = membros.includes(target.id as string)
                if (selected === target.roles.includes(id)) continue
                if (selected && !role.ativo) throw new DomainError(409, "Perfil inativo não pode receber membros")
                await saveUser(current, target.id as string, { nome: target.name, ativo: target.active, cargos: selected ? [...target.roles, id] : target.roles.filter(value => value !== id), version: target.accessVersion }, session)
            }
        }
        await auditAccess(current, "role.update", id, before, { ...data, ...(membros ? { membros } : {}) }, session)
        return { id }
    })
}
export const deleteRole = (context: AccessContext, id: string, version: number) => authorityTransaction(context, ["roles.edit"], async (current, session) => {
    const models = accessModels()
    const role = await models.roles.findById(id).session(session)
    if (!role) throw missing()
    if (role.version !== version) throw conflict()
    if (role.slug === "admin" || !canManageRole(current.roles, role)) throw denied()
    if (await models.users.exists({ roles: id }).session(session)) throw new DomainError(409, "Remova os membros antes de excluir o perfil")
    await models.roles.deleteOne({ _id: id }, { session })
    await models.states.updateOne({ _id: "global" }, { $pull: { ordem: id }, $inc: { version: 1 } }, { session })
    await auditAccess(current, "role.delete", id, { nome: role.nome }, null, session)
    return { id }
})
export async function reorderRoles(context: AccessContext, raw: unknown) {
    const { ordem, version } = parseInput(reorderSchema, raw)
    return authorityTransaction(context, ["roles.edit"], async (current, session) => {
        const models = accessModels()
        const state = await models.states.findById("global").session(session).orFail()
        if (state.version !== version) throw conflict()
        const rows = await roleRows(session)
        const movable = rows.filter(row => row.slug !== "admin")
        if (ordem.length !== movable.length || ordem.some(id => !movable.some(row => row.id === id && canManageRole(current.roles, row)))) throw denied("Ordem de perfis inválida")
        const next = [...rows.filter(row => row.slug === "admin").map(row => row.id), ...ordem]
        await models.states.updateOne({ _id: "global" }, { $set: { ordem: next }, $inc: { version: 1 } }, { session })
        await auditAccess(current, "role.reorder", "global", rows.map(row => row.id), next, session)
        return { alterados: ordem.length }
    })
}
