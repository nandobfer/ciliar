import mongoose from "mongoose"
import { DomainError } from "@/lib/api/route"
import { logger } from "@/lib/logger"
import { accessModels } from "@/features/access/server/models"
import { assertTransactionTopology } from "@/features/access/server/access"
import { parseInput } from "@/features/access/server/commands"
import { signupAvailability } from "@/features/platform/server/settings"
import { passwordSignupSchema } from "../schemas"
import { hashPassword } from "./password"

const isDuplicate = (error: unknown) => typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === 11000
const taken = () => new DomainError(409, "Não foi possível criar a conta com este e-mail. Se ele já tem conta, entre com o seu método de acesso.", "SIGNUP_EMAIL_TAKEN")

/**
 * Cadastro público por e-mail e senha (`/login` › Criar conta), com as mesmas regras do cadastro pelo
 * Google: transação com o fence compartilhado, perfil padrão da Plataforma e termos publicados
 * (falha fechado), `signupSource: "public"`, aceite dos termos no primeiro acesso.
 *
 * O e-mail não é verificado: a senha fica `passwordUnverified` e é descartada se o dono do e-mail
 * entrar depois com o Google (ver `resolveGoogleAccount`), evitando o sequestro prévio da conta.
 */
export async function signupWithPassword(raw: unknown): Promise<{ id: string; email: string }> {
    const data = parseInput(passwordSignupSchema, raw)
    const models = accessModels()
    const { users, audits, states } = models
    if (await users.exists({ email: data.email })) throw taken()
    const passwordHash = await hashPassword(data.password)
    await assertTransactionTopology()
    await Promise.all(Object.values(models).map((model) => model.init()))
    await states.updateOne({ _id: "global" }, { $setOnInsert: { ordem: [], version: 0, fence: 0 } }, { upsert: true })
    try {
        const created = await mongoose.connection.transaction(
            async (session) => {
                await states.updateOne({ _id: "global" }, { $inc: { fence: 1 } }, { session })
                const availability = await signupAvailability(session)
                if (!availability.available || !availability.defaultRoleId) return null
                const [user] = await users.create(
                    [{ name: data.nome, email: data.email, active: true, roles: [availability.defaultRoleId], signupSource: "public", passwordHash, passwordSetAt: new Date(), passwordUnverified: true }],
                    { session },
                )
                await audits.create(
                    [{ actorId: "password-signup", action: "user.signup", targetId: user!.id as string, before: null, after: { nome: data.nome, email: data.email, ativo: true, cargos: [availability.defaultRoleId], metodo: "senha" }, simulation: null }],
                    { session },
                )
                return { id: user!.id as string, email: data.email }
            },
            { readPreference: "primary", writeConcern: { w: "majority" }, maxCommitTimeMS: 10000 },
        )
        if (!created) throw new DomainError(409, "O cadastro público está indisponível no momento. Peça um convite a um administrador.", "SIGNUP_UNAVAILABLE")
        logger.info({ action: "auth.signup", actorId: created.id }, "Cadastro público por e-mail e senha")
        return created
    } catch (error) {
        if (isDuplicate(error)) throw taken()
        throw error
    }
}
