import type { Connection } from "mongoose"
import { identitySchema } from "../schemas"
import { accessModels } from "./models"
import { assertTransactionTopology } from "./access"
import { hashPassword } from "@/features/auth/server/password"
import { DomainError } from "@/lib/api/route"

export const OPERATOR_ADMIN = "__administrator__"
/** Exclusivo do CLI, nunca exposto em uma rota HTTP nem chamado durante startup. */
export async function createOperatorUser(connection: Connection, raw: unknown, selectedRoles: string[]) {
    const data = identitySchema.parse(raw)
    if (!selectedRoles.length || new Set(selectedRoles).size !== selectedRoles.length) throw new DomainError(400, "Selecione ao menos um perfil, sem repetições")
    if (connection.name !== "ciliar" && process.env.NODE_ENV !== "test") throw new DomainError(400, "O cadastro operacional deve usar o banco ciliar")
    await assertTransactionTopology(connection)
    const models = accessModels(connection)
    await Promise.all(Object.values(models).map(model => model.init()))
    if (await models.users.exists({ email: data.email })) throw new DomainError(409, "Já existe um usuário com esse e-mail. Nenhuma conta foi alterada.")
    const passwordHash = await hashPassword(data.password)
    await models.states.updateOne({ _id: "global" }, { $setOnInsert: { ordem: [], version: 0, fence: 0 } }, { upsert: true })
    try {
        return await connection.transaction(async session => {
            await models.states.updateOne({ _id: "global" }, { $inc: { fence: 1 } }, { session })
            const roleIds = selectedRoles.filter(id => id !== OPERATOR_ADMIN)
            if (selectedRoles.includes(OPERATOR_ADMIN)) {
                const admin = await models.roles.findOneAndUpdate({ slug: "admin" }, { $setOnInsert: { nome: "Administrador", descricao: "Todas as permissões, inclusive futuras", cor: "vermelho", permissoes: ["*"], ativo: true, createdBy: "operator-cli" } }, { upsert: true, returnDocument: "after", session }).orFail()
                if (!admin.ativo || admin.permissoes.length !== 1 || admin.permissoes[0] !== "*") throw new DomainError(409, "O perfil Administrador está inconsistente. Revise antes de continuar.")
                roleIds.push(admin.id as string)
            }
            if (roleIds.some(id => !/^[a-f\d]{24}$/i.test(id)) || new Set(roleIds).size !== roleIds.length || await models.roles.countDocuments({ _id: { $in: roleIds }, ativo: true }).session(session) !== roleIds.length) throw new DomainError(400, "Perfil inexistente, repetido ou inativo")
            const [user] = await models.users.create([{ name: data.nome, email: data.email, passwordHash, active: true, roles: roleIds, mustChangePassword: false }], { session })
            await models.audits.create([{ actorId: "operator-cli", action: "user.create", targetId: user!.id as string, after: { nome: data.nome, email: data.email, cargos: roleIds, ativo: true }, simulation: null }], { session })
            return { id: user!.id as string }
        }, { readPreference: "primary", writeConcern: { w: "majority" } })
    } catch (error) {
        if (typeof error === "object" && error && "code" in error && error.code === 11000) throw new DomainError(409, "Já existe um usuário com esse e-mail. Nenhuma conta foi alterada.")
        throw error
    }
}
