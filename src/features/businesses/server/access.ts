import mongoose, { type ClientSession } from "mongoose"
import { dbConnect } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { can } from "@/features/access/catalog"
import { assertTransactionTopology, auditAccess, denied, resolveAccess } from "@/features/access/server/access"
import type { AccessContext } from "@/features/access/server/context"
import type { RoleDto } from "@/features/access/types"
import { orderModels } from "@/features/orders/server/models"
import { workModels } from "@/features/works/server/models"
import { businessModels } from "./models"

/**
 * Acesso aos negócios — SOMENTE servidor.
 *
 * **Dono efetivo** (`businessOwnerOf`): na simulação de **usuário** ("Visualizar como" um usuário),
 * as ações de negócio agem sobre os negócios do alvo como se ele fosse o dono (exceção documentada
 * ao "identidade nunca é simulada"); a auditoria continua registrando o ator real com a simulação.
 * Sem simulação ou na simulação de **perfil**, o dono é o usuário real.
 */
export function businessOwnerOf(access: Pick<AccessContext, "userId" | "dto">): string {
    const simulation = access.dto.simulation
    return simulation?.tipo === "usuario" ? simulation.alvoId : access.userId
}

export const canUseBusinesses = (access: Pick<AccessContext, "effective">) => can(access.effective, "businesses.use")
/** Suporte: ver negócios e entrevistas de outros usuários (somente leitura, auditado). */
export const canSupportBusinesses = (access: Pick<AccessContext, "effective">) => can(access.effective, "businesses.view_all")

export function requireBusinessUse(access: AccessContext): void {
    if (!canUseBusinesses(access)) throw denied("Seu perfil não permite usar Negócios (businesses.use).")
}

/** Maior limite entre os perfis ativos (perfil ilimitado vence); `null` = ilimitado. */
export function businessLimitOf(roles: readonly Pick<RoleDto, "ativo" | "limiteNegocios">[]): number | null {
    const values = roles.filter((role) => role.ativo).map((role) => role.limiteNegocios ?? null)
    if (!values.length || values.includes(null)) return null
    return Math.max(...(values as number[]))
}

export const limitReached = (limit: number | null) =>
    new DomainError(409, `Você atingiu o limite de ${limit} negócio(s) ativo(s) do seu perfil. Arquive um negócio para liberar uma vaga.`, "BUSINESS_LIMIT_REACHED")

export const businessNotFound = () => new DomainError(404, "Negócio não encontrado", "BUSINESS_NOT_FOUND")

/** Auditoria em `access_audit`: ator real + marcador da simulação (o alvo da simulação nunca vira ator). */
export async function auditBusiness(context: Pick<AccessContext, "userId" | "dto">, action: string, targetId: string, before: unknown, after: unknown, session?: ClientSession) {
    await auditAccess(context, action, targetId, before, after, session)
}

export async function ensureBusinessCollections(): Promise<void> {
    await Promise.all([...Object.values(businessModels()), ...Object.values(orderModels()), ...Object.values(workModels())].map((model) => model.init()))
}

/**
 * Transação das alterações de negócio que dependem de vaga ou do contador do dono: replica set,
 * fence por dono (dois "concluir"/"restaurar" simultâneos não estouram o limite), majority e o acesso
 * relido dentro da transação (sem `admin.access`: o prestador não tem o painel).
 */
export async function businessTransaction<T>(initial: AccessContext, permissions: string[], action: (current: AccessContext, session: ClientSession, ownerId: string) => Promise<T>): Promise<T> {
    if (!permissions.every((key) => can(initial.effective, key))) throw denied()
    await dbConnect()
    await assertTransactionTopology()
    await ensureBusinessCollections()
    const ownerId = businessOwnerOf(initial)
    const models = businessModels()
    await models.ownerStates.updateOne({ _id: ownerId }, { $setOnInsert: { fence: 0, seq: 0 } }, { upsert: true })
    return mongoose.connection.transaction(
        async (session) => {
            await models.ownerStates.updateOne({ _id: ownerId }, { $inc: { fence: 1 } }, { session })
            const current = await resolveAccess(initial.userId, initial.viewAsHeader, session, initial.sessionVersion)
            if (current.legalAcceptanceRequired) throw denied("Aceite os termos de uso e a política de privacidade para continuar.", "TERMS_ACCEPTANCE_REQUIRED")
            if (!permissions.every((key) => can(current.effective, key))) throw denied()
            if (businessOwnerOf(current) !== ownerId) throw new DomainError(409, "A simulação mudou durante a operação. Recarregue e tente de novo.", "VIEW_AS_CHANGED")
            return action(current, session, ownerId)
        },
        { readPreference: "primary", writeConcern: { w: "majority" }, maxCommitTimeMS: 10000 },
    )
}
