import mongoose from "mongoose"
import { accessModels } from "@/features/access/server/models"
import { assertTransactionTopology } from "@/features/access/server/access"
import { signupAvailability } from "@/features/platform/server/settings"
import { logger } from "@/lib/logger"

/** Motivos de recusa exibidos em `/login?erro=…` (ver `LOGIN_ERROR_MESSAGES`). */
export type GoogleDenialCode = "nao-verificado" | "inativo" | "cadastro-indisponivel" | "conta-vinculada" | "falha"

export interface GoogleIdentity {
    /** `sub` estável da conta Google (`providerAccountId`). */
    sub: string
    email?: string | null
    emailVerified: boolean
    name?: string | null
}

export type GoogleAccountResult =
    | { status: "ok"; userId: string; sessionVersion: number; outcome: "existing" | "linked" | "signup" }
    | { status: "denied"; code: GoogleDenialCode }

const denied = (code: GoogleDenialCode): GoogleAccountResult => ({ status: "denied", code })
const isDuplicate = (error: unknown) => typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === 11000

/**
 * Resolve a conta do Ciliar para um login Google:
 * 1. e-mail não verificado (ou ausente) é recusado;
 * 2. conta já vinculada pelo `sub` entra (inativa continua bloqueada);
 * 3. conta com o mesmo e-mail e sem vínculo (convite, CLI ou usuário migrado) é vinculada
 *    automaticamente e mantém perfis, histórico e auditoria;
 * 4. e-mail já vinculado a OUTRA conta Google é recusado (nunca troca o vínculo);
 * 5. e-mail novo vira cadastro público com o perfil padrão — falha fechado sem perfil padrão
 *    válido ou sem termos publicados. O aceite dos termos é exigido no primeiro acesso.
 */
export async function resolveGoogleAccount(identity: GoogleIdentity, attempt = 0): Promise<GoogleAccountResult> {
    const sub = identity.sub?.trim()
    if (!sub || sub.length > 255) return denied("falha")
    const email = identity.email?.trim().toLowerCase()
    if (!identity.emailVerified || !email) return denied("nao-verificado")

    const models = accessModels()
    const { users, audits, states } = models
    const now = new Date()

    const bySub = await users.findOne({ googleSub: sub })
    if (bySub) {
        if (!bySub.active) return denied("inativo")
        await users.updateOne({ _id: bySub._id }, { $set: { lastLoginAt: now } })
        return { status: "ok", userId: bySub.id as string, sessionVersion: bySub.sessionVersion, outcome: "existing" }
    }

    const byEmail = await users.findOne({ email }).select("+googleSub")
    if (byEmail) {
        if (byEmail.googleSub) return denied("conta-vinculada")
        if (!byEmail.active) return denied("inativo")
        try {
            const linked = await users.updateOne({ _id: byEmail._id, active: true, googleSub: null }, { $set: { googleSub: sub, lastLoginAt: now } })
            if (!linked.modifiedCount) return attempt === 0 ? resolveGoogleAccount(identity, 1) : denied("falha")
        } catch (error) {
            if (isDuplicate(error)) return attempt === 0 ? resolveGoogleAccount(identity, 1) : denied("conta-vinculada")
            throw error
        }
        await audits.create({ actorId: byEmail.id as string, action: "user.google_link", targetId: byEmail.id as string, before: null, after: { email }, simulation: null })
        logger.info({ action: "auth.google-link", actorId: byEmail.id }, "Conta Google vinculada ao usuário existente")
        return { status: "ok", userId: byEmail.id as string, sessionVersion: byEmail.sessionVersion, outcome: "linked" }
    }

    // Cadastro público: atribui o perfil padrão (autoridade) dentro do fence compartilhado.
    await assertTransactionTopology()
    await Promise.all(Object.values(models).map((model) => model.init()))
    await states.updateOne({ _id: "global" }, { $setOnInsert: { ordem: [], version: 0, fence: 0 } }, { upsert: true })
    const name = identity.name?.trim().slice(0, 100) || email.split("@")[0]!
    try {
        const created = await mongoose.connection.transaction(
            async (session) => {
                await states.updateOne({ _id: "global" }, { $inc: { fence: 1 } }, { session })
                const availability = await signupAvailability(session)
                if (!availability.available || !availability.defaultRoleId) return null
                const [user] = await users.create([{ name, email, active: true, roles: [availability.defaultRoleId], googleSub: sub, signupSource: "public", lastLoginAt: now }], { session })
                await audits.create(
                    [{ actorId: "google-signup", action: "user.signup", targetId: user!.id as string, before: null, after: { nome: name, email, ativo: true, cargos: [availability.defaultRoleId] }, simulation: null }],
                    { session },
                )
                return { id: user!.id as string, sessionVersion: user!.sessionVersion }
            },
            { readPreference: "primary", writeConcern: { w: "majority" }, maxCommitTimeMS: 10000 },
        )
        if (!created) return denied("cadastro-indisponivel")
        logger.info({ action: "auth.signup", actorId: created.id }, "Cadastro público pelo Google")
        return { status: "ok", userId: created.id, sessionVersion: created.sessionVersion, outcome: "signup" }
    } catch (error) {
        // Dois primeiros acessos simultâneos: o segundo encontra a conta criada pelo primeiro.
        if (isDuplicate(error) && attempt === 0) return resolveGoogleAccount(identity, 1)
        throw error
    }
}
