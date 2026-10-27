import type { ClientSession } from "mongoose"
import { canManageUser } from "@nandobfer/perfix"
import { DomainError } from "@/lib/api/route"
import { logger } from "@/lib/logger"
import { hashPassword, verifyPassword } from "@/features/auth/server/password"
import { checkRateLimit } from "@/features/auth/server/rate-limit"
import { changePasswordSchema, setUserPasswordSchema } from "../schemas"
import { auditAccess, authorityTransaction, denied, roleRows } from "./access"
import { parseInput } from "./commands"
import type { AccessContext } from "./context"
import { accessModels } from "./models"

const missing = () => new DomainError(404, "Registro não encontrado", "NOT_FOUND")

/** Alvo dentro da hierarquia do ator e diferente dele (a própria senha muda em "Alterar senha"). */
async function managedTarget(context: AccessContext, id: string, session: ClientSession) {
    if (id === context.userId) throw denied("Para a sua própria senha, use \"Alterar senha\" no menu da sua conta")
    const user = await accessModels().users.findById(id).select("+passwordHash +googleSub").session(session)
    if (!user) throw missing()
    const rows = await roleRows(session)
    const roles = rows.filter(row => user.roles.includes(row.id))
    if (roles.length !== user.roles.length || !canManageUser(context.roles, roles)) throw denied("Usuário fora do alcance da sua hierarquia")
    return user
}

/**
 * Administrador define ou redefine a senha de outro usuário (Argon2id). Encerra as sessões do
 * usuário (`sessionVersion + 1`); auditoria sem o valor.
 */
export async function setUserPassword(context: AccessContext, id: string, raw: unknown): Promise<{ id: string; senha: true }> {
    const { password } = parseInput(setUserPasswordSchema, raw)
    const passwordHash = await hashPassword(password)
    return authorityTransaction(context, ["users.edit"], async (current, session) => {
        const user = await managedTarget(current, id, session)
        const had = !!user.passwordHash
        await accessModels().users.updateOne({ _id: user._id }, { $set: { passwordHash, passwordSetAt: new Date(), passwordUnverified: false }, $inc: { sessionVersion: 1 } }, { session })
        await auditAccess(current, "user.password_set", id, { senha: had }, { senha: true }, session)
        return { id, senha: true as const }
    })
}

/** Remove a senha de outro usuário (ele passa a entrar só com o Google, se vinculado). */
export async function removeUserPassword(context: AccessContext, id: string): Promise<{ id: string; senha: false; google: boolean }> {
    return authorityTransaction(context, ["users.edit"], async (current, session) => {
        const user = await managedTarget(current, id, session)
        if (!user.passwordHash) throw new DomainError(409, "Este usuário não tem senha.", "PASSWORD_NOT_SET")
        await accessModels().users.updateOne({ _id: user._id }, { $unset: { passwordHash: "" }, $set: { passwordSetAt: null, passwordUnverified: false }, $inc: { sessionVersion: 1 } }, { session })
        await auditAccess(current, "user.password_removed", id, { senha: true }, { senha: false }, session)
        return { id, senha: false as const, google: !!user.googleSub }
    })
}

/**
 * Própria conta: troca a senha (exige a atual) ou cria a primeira (conta só com Google). Encerra
 * todas as sessões da conta, inclusive a atual: é preciso entrar de novo.
 */
export async function changeOwnPassword(context: AccessContext, raw: unknown): Promise<{ changed: true }> {
    checkRateLimit(`password:${context.userId}`)
    const data = parseInput(changePasswordSchema, raw)
    const { users, audits } = accessModels()
    const user = await users.findById(context.userId).select("+passwordHash").orFail()
    if (user.passwordHash) {
        if (!data.currentPassword || !(await verifyPassword(user.passwordHash, data.currentPassword))) throw new DomainError(400, "Senha atual incorreta", "INVALID_PASSWORD")
        if (await verifyPassword(user.passwordHash, data.newPassword)) throw new DomainError(400, "A nova senha deve ser diferente da atual")
    }
    const changed = await users.updateOne(
        { _id: user._id, active: true, sessionVersion: context.sessionVersion, passwordHash: user.passwordHash ?? null },
        { $set: { passwordHash: await hashPassword(data.newPassword), passwordSetAt: new Date(), passwordUnverified: false }, $inc: { sessionVersion: 1 } },
    )
    if (!changed.modifiedCount) throw new DomainError(409, "Sua conta foi alterada. Entre novamente")
    await audits.create({ actorId: context.userId, action: user.passwordHash ? "user.password_changed" : "user.password_created", targetId: context.userId, before: null, after: { senha: true }, simulation: context.dto.simulation })
    logger.info({ action: "auth.password-changed", actorId: context.userId }, "Senha alterada e sessões revogadas")
    return { changed: true }
}
