import { DomainError } from "@/lib/api/route"
import { accessModels } from "@/features/access/server/models"
import { auditAccess, authorityTransaction } from "@/features/access/server/access"
import { parseInput } from "@/features/access/server/commands"
import type { AccessContext } from "@/features/access/server/context"
import { PLATFORM_SETTINGS_ID } from "../constants"
import { legalAcceptSchema, legalPublishSchema } from "../schemas"
import type { LegalOverviewDto, LegalVersionDto, LegalVersionSummary, MyLegalDto } from "../types"
import { platformModels, type LegalVersionRecord } from "./models"
import { currentLegalVersion, ensurePlatformRecord } from "./state"

async function publisherNames(ids: string[]): Promise<Map<string, string>> {
    const valid = [...new Set(ids)].filter((id) => /^[a-f\d]{24}$/i.test(id))
    if (!valid.length) return new Map()
    const users = await accessModels().users.find({ _id: { $in: valid } }).select({ name: 1 }).lean()
    return new Map(users.map((user) => [String(user._id), user.name]))
}

function summary(record: LegalVersionRecord, names: Map<string, string>): LegalVersionSummary {
    return {
        version: record.version,
        publishedAt: record.publishedAt.toISOString(),
        publishedBy: record.publishedBy,
        publishedByName: names.get(record.publishedBy) ?? null,
        notes: record.notes ?? "",
    }
}

function full(record: LegalVersionRecord, names: Map<string, string>): LegalVersionDto {
    return { ...summary(record, names), termsOfUse: record.termsOfUse, privacyPolicy: record.privacyPolicy }
}

/** Versão vigente (texto completo) ou `null` se nada foi publicado. Pública: usada por `/termos` e `/privacidade`. */
export async function getCurrentLegal(): Promise<LegalVersionDto | null> {
    const version = await currentLegalVersion()
    if (version < 1) return null
    return getLegalVersion(version)
}

export async function getLegalVersion(version: number): Promise<LegalVersionDto | null> {
    const record = await platformModels().legal.findOne({ version }).lean()
    if (!record) return null
    return full(record, await publisherNames([record.publishedBy]))
}

export async function getLegalOverview(): Promise<LegalOverviewDto> {
    const records = await platformModels().legal.find().sort({ version: -1 }).limit(200).lean()
    const names = await publisherNames(records.map((record) => record.publishedBy))
    const currentVersion = await currentLegalVersion()
    const current = records.find((record) => record.version === currentVersion)
    return { current: current ? full(current, names) : null, history: records.map((record) => summary(record, names)) }
}

/**
 * Publica uma nova versão (imutável) dos termos de uso e da política de privacidade. A partir do
 * commit, todo usuário (inclusive quem publicou) fica bloqueado até aceitar a nova versão.
 */
export async function publishLegalVersion(context: AccessContext, raw: unknown): Promise<{ version: number }> {
    const data = parseInput(legalPublishSchema, raw)
    await ensurePlatformRecord()
    return authorityTransaction(context, ["integrations.platform.edit"], async (current, session) => {
        const models = platformModels()
        const previous = await currentLegalVersion(session)
        const version = previous + 1
        await models.legal.create([{ version, termsOfUse: data.termsOfUse, privacyPolicy: data.privacyPolicy, notes: data.notes, publishedBy: current.userId, publishedAt: new Date() }], { session })
        const updated = await models.settings.updateOne({ _id: PLATFORM_SETTINGS_ID, legalVersion: previous }, { $set: { legalVersion: version, updatedBy: current.userId } }, { session })
        if (!updated.modifiedCount) throw new DomainError(409, "Outra versão foi publicada ao mesmo tempo. Recarregue e revise.", "VERSION_CONFLICT")
        await auditAccess(current, "legal.publish", "platform", { version: previous }, { version, notes: data.notes, termsOfUseLength: data.termsOfUse.length, privacyPolicyLength: data.privacyPolicy.length }, session)
        return { version }
    })
}

export async function getMyLegal(userId: string): Promise<MyLegalDto> {
    const [user, current] = await Promise.all([accessModels().users.findById(userId).select({ legalAcceptance: 1 }).lean(), getCurrentLegal()])
    const accepted = user?.legalAcceptance ?? null
    return {
        current,
        acceptedVersion: accepted?.version ?? null,
        acceptedAt: accepted?.acceptedAt ? new Date(accepted.acceptedAt).toISOString() : null,
        acceptanceRequired: !!current && accepted?.version !== current.version,
    }
}

/** Registra o aceite do usuário **real** (nunca o alvo de uma simulação) somente da versão vigente. */
export async function acceptLegal(context: Pick<AccessContext, "userId" | "dto" | "sessionVersion">, raw: unknown): Promise<{ version: number; acceptedAt: string }> {
    const { version } = parseInput(legalAcceptSchema, raw)
    const current = await currentLegalVersion()
    if (current < 1 || version !== current) throw new DomainError(409, "Há uma versão mais recente dos termos. Leia e aceite a versão atual.", "LEGAL_VERSION_OUTDATED")
    const acceptedAt = new Date()
    const { users } = accessModels()
    const before = await users.findById(context.userId).select({ legalAcceptance: 1 }).lean()
    const result = await users.updateOne({ _id: context.userId, active: true, sessionVersion: context.sessionVersion }, { $set: { legalAcceptance: { version, acceptedAt } } })
    if (!result.matchedCount) throw new DomainError(401, "Sessão expirada", "UNAUTHORIZED")
    await auditAccess(context, "legal.accept", context.userId, before?.legalAcceptance ?? null, { version, acceptedAt: acceptedAt.toISOString() })
    return { version, acceptedAt: acceptedAt.toISOString() }
}
