import mongoose, { Types, type ClientSession } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import { deleteFile, getFileObject, storageErrorInfo } from "@/lib/storage/s3"
import { publishToChannels } from "@/lib/pusher/channels"
import { BUSINESS_SPACE_UPDATED_EVENT, BUSINESSES_UPDATED_EVENT, businessesChannel } from "@/lib/pusher/channel-names"
import { parseInput } from "@/features/access/server/commands"
import { accessModels } from "@/features/access/server/models"
import type { AccessContext } from "@/features/access/server/context"
import { denied } from "@/features/access/server/access"
import { loadPlatformState } from "@/features/platform/server/state"
import { orderModels } from "@/features/orders/server/models"
import { workModels } from "@/features/works/server/models"
import { autoBusinessName, DEFAULT_BUSINESS_THEME, DEFAULT_CURRENCY, DEFAULT_DEADLINE_ALERT_DAYS, DEFAULT_QUOTE_VALIDITY_DAYS, type BusinessSpaceKind } from "../constants"
import { businessUpdateSchema, type BusinessGoalInput } from "../schemas"
import type { BusinessCapacityDto, BusinessDetailDto, BusinessDto, BusinessGoalDto, BusinessListDto } from "../types"
import {
    auditBusiness,
    businessLimitOf,
    businessNotFound,
    businessOwnerOf,
    businessTransaction,
    canSupportBusinesses,
    canBusiness,
    canUseBusinesses,
    canUseModule,
    ensureBusinessCollections,
    limitReached,
    requireModuleRead,
} from "./access"
import type { BusinessModule } from "../permissions"
import { businessModels, type BusinessGoalRecord, type BusinessLogo, type BusinessRecord } from "./models"

/**
 * Negócios (M1) — SOMENTE servidor. Cada negócio tem um único dono; só o dono altera. Quem tem
 * `businesses.view_all` lê os de outros usuários (somente leitura, auditado). Na simulação de
 * usuário o dono efetivo é o alvo (ver `businessOwnerOf`).
 */

const log = loggerFor({ module: "businesses" })
const DAY_MS = 24 * 60 * 60 * 1000

type BusinessDoc = BusinessRecord & { _id: Types.ObjectId }
type GoalDoc = BusinessGoalRecord & { _id: Types.ObjectId }

export const businessLogoPath = (id: string) => `/api/businesses/${id}/logo`

/** Só invalidação `{ id }` no canal do dono: a tela relê pela API autorizada. */
export async function publishBusinessesChanged(ownerId: string, id: string): Promise<void> {
    await publishToChannels([businessesChannel(ownerId)], BUSINESSES_UPDATED_EVENT, { id }).catch(() => undefined)
}

/** Itens do espaço (M2): invalidação `{ businessId, kind }` no canal do dono. */
export async function publishSpaceChanged(ownerId: string, businessId: string, kind: BusinessSpaceKind): Promise<void> {
    await publishToChannels([businessesChannel(ownerId)], BUSINESS_SPACE_UPDATED_EVENT, { businessId, kind }).catch(() => undefined)
}

export function toBusinessDto(doc: BusinessDoc, retentionDays: number, ownerName: string | null = null): BusinessDto {
    const id = doc._id.toString()
    const archivedAt = doc.archivedAt ? new Date(doc.archivedAt) : null
    return {
        id,
        ownerId: doc.ownerId,
        ownerName,
        number: doc.number,
        name: doc.name,
        type: doc.type ?? null,
        subtype: doc.subtype ?? null,
        segment: doc.segment ?? null,
        description: doc.description ?? null,
        logo: doc.logo ? { name: doc.logo.name, mediaType: doc.logo.mediaType, size: doc.logo.size, url: `${businessLogoPath(id)}?v=${encodeURIComponent(doc.logo.key.split("/").slice(-2).join("-"))}` } : null,
        links: doc.links ?? [],
        availability: (doc.availability ?? []).map((day) => ({ weekday: day.weekday, start: day.start ?? null, end: day.end ?? null })),
        currency: doc.currency ?? DEFAULT_CURRENCY,
        theme: { primaryColor: doc.theme?.primaryColor ?? DEFAULT_BUSINESS_THEME.primaryColor, mode: doc.theme?.mode === "light" ? "light" : "dark" },
        contactEmail: doc.contactEmail ?? null,
        contactPhone: doc.contactPhone ?? null,
        deadlineAlertDays: doc.deadlineAlertDays ?? DEFAULT_DEADLINE_ALERT_DAYS,
        quoteValidityDays: doc.quoteValidityDays ?? DEFAULT_QUOTE_VALIDITY_DAYS,
        status: doc.status,
        archivedAt: archivedAt ? archivedAt.toISOString() : null,
        purgeAt: archivedAt && doc.status === "archived" ? new Date(archivedAt.getTime() + retentionDays * DAY_MS).toISOString() : null,
        interviewId: doc.interviewId ?? null,
        version: doc.version ?? 0,
        createdAt: new Date(doc.createdAt).toISOString(),
        updatedAt: new Date(doc.updatedAt).toISOString(),
    }
}

export function toGoalDto(doc: GoalDoc): BusinessGoalDto {
    return {
        id: doc._id.toString(),
        name: doc.name ?? null,
        targetCents: doc.targetCents,
        period: doc.period,
        measure: doc.measure ?? null,
        mode: doc.mode ?? null,
        month: doc.month ?? null,
        year: doc.year ?? null,
        from: doc.from ?? null,
        to: doc.to ?? null,
    }
}

async function retentionDays(): Promise<number> {
    return (await loadPlatformState()).settings.retentionDays.businesses
}

async function ownerNames(ids: readonly string[]): Promise<Map<string, string>> {
    const valid = [...new Set(ids)].filter((id) => Types.ObjectId.isValid(id))
    if (!valid.length) return new Map()
    const users = await accessModels().users.find({ _id: { $in: valid } }).select({ name: 1 }).lean()
    return new Map(users.map((user) => [String(user._id), user.name]))
}

export function assertBusinessId(id: string): void {
    if (!Types.ObjectId.isValid(id)) throw businessNotFound()
}

/** Contagens do dono (ativos contam no limite; arquivados não). */
export async function countBusinesses(ownerId: string, session: ClientSession | null = null): Promise<{ active: number; archived: number }> {
    const { businesses } = businessModels()
    const [active, archived] = await Promise.all([
        businesses.countDocuments({ ownerId, status: "active" }).session(session),
        businesses.countDocuments({ ownerId, status: "archived" }).session(session),
    ])
    return { active, archived }
}

export async function businessCapacity(access: AccessContext, session: ClientSession | null = null): Promise<BusinessCapacityDto> {
    const limit = businessLimitOf(access.roles)
    const counts = await countBusinesses(businessOwnerOf(access), session)
    const vacancy = limit === null || counts.active < limit
    return { limit, ...counts, vacancy, canCreate: canBusiness(access, "businesses.create") && vacancy }
}

/** Confere a vaga (dentro da transação com o fence do dono). */
export async function assertBusinessVacancy(access: AccessContext, session: ClientSession): Promise<void> {
    const capacity = await businessCapacity(access, session)
    if (capacity.limit !== null && capacity.active >= capacity.limit) throw limitReached(capacity.limit)
}

/**
 * Negócio visível: o dono efetivo vê os próprios; o suporte (`businesses.view_all`) vê os demais
 * em leitura, com auditoria do acesso. Qualquer outro caso é 404 (não revela existência).
 */
export async function loadVisibleBusiness(access: AccessContext, id: string, options: { audit?: boolean; section?: string; module?: BusinessModule | null } = {}): Promise<{ doc: BusinessDoc; own: boolean }> {
    assertBusinessId(id)
    await dbConnect()
    const doc = await businessModels().businesses.findById(id).lean<BusinessDoc>()
    if (!doc) throw businessNotFound()
    const own = doc.ownerId === businessOwnerOf(access)
    if (own && canUseBusinesses(access)) {
        if (!options.module || canUseModule(access, options.module)) return { doc, own }
        // Dono sem a visualização do módulo: só o suporte ainda lê (somente leitura).
        if (!canSupportBusinesses(access)) requireModuleRead(access, options.module)
    }
    if (!canSupportBusinesses(access)) throw businessNotFound()
    if (options.audit !== false) await auditBusiness(access, "business.support_view", id, null, { ownerId: doc.ownerId, ...(options.section ? { section: options.section } : {}) })
    return { doc, own: false }
}

/** Moeda travada: já há pedidos (qualquer status, inclusive rascunho/cancelado) ou trabalhos no negócio. */
export async function currencyLocked(businessId: string, session: ClientSession | null = null): Promise<boolean> {
    const { orders, works } = orderModels()
    const [order, work] = await Promise.all([orders.exists({ businessId }).session(session), works.exists({ businessId }).session(session)])
    return Boolean(order || work)
}

/** Itens com valor na moeda do negócio (não convertidos ao trocar a moeda). */
async function valuedItems(businessId: string): Promise<{ activities: number; goals: number }> {
    const models = businessModels()
    const [activities, goals] = await Promise.all([models.activities.countDocuments({ businessId }), models.goals.countDocuments({ businessId })])
    return { activities, goals }
}

async function ownerEmail(ownerId: string): Promise<string | null> {
    if (!Types.ObjectId.isValid(ownerId)) return null
    const user = await accessModels().users.findById(ownerId).select({ email: 1 }).lean<{ email?: string }>()
    return user?.email ?? null
}

export async function listBusinesses(access: AccessContext, query: { status?: "active" | "archived" | "all"; ownerId?: string | null } = {}): Promise<BusinessListDto> {
    await dbConnect()
    await ensureBusinessCollections()
    const own = businessOwnerOf(access)
    const ownerId = query.ownerId ?? own
    const support = ownerId !== own
    if (support && !canSupportBusinesses(access)) throw denied("Ver negócios de outros usuários exige businesses.view_all.")
    if (!support && !canUseBusinesses(access) && !canSupportBusinesses(access)) throw denied("Seu perfil não permite usar Negócios.")
    const status = query.status ?? "all"
    const docs = await businessModels()
        .businesses.find({ ownerId, ...(status === "all" ? {} : { status }) })
        .sort({ status: 1, createdAt: 1 })
        .lean<BusinessDoc[]>()
    if (support) await auditBusiness(access, "business.support_list", ownerId, null, { count: docs.length })
    const [days, names] = await Promise.all([retentionDays(), ownerNames([ownerId])])
    return { items: docs.map((doc) => toBusinessDto(doc, days, names.get(ownerId) ?? null)), capacity: await businessCapacity(access) }
}

/** Busca no suporte: negócios de todos os usuários por nome (somente `businesses.view_all`). */
export async function searchAllBusinesses(access: AccessContext, query: { q?: string; status?: "active" | "archived" | "all"; limit?: number }): Promise<BusinessDto[]> {
    if (!canSupportBusinesses(access)) throw denied("Buscar negócios de outros usuários exige businesses.view_all.")
    await dbConnect()
    const filter: Record<string, unknown> = {}
    if (query.status && query.status !== "all") filter.status = query.status
    if (query.q?.trim()) filter.name = { $regex: query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" }
    const docs = await businessModels().businesses.find(filter).sort({ updatedAt: -1 }).limit(Math.min(query.limit ?? 50, 200)).lean<BusinessDoc[]>()
    await auditBusiness(access, "business.support_search", "businesses", null, { q: query.q ?? null, count: docs.length })
    const [days, names] = await Promise.all([retentionDays(), ownerNames(docs.map((doc) => doc.ownerId))])
    return docs.map((doc) => toBusinessDto(doc, days, names.get(doc.ownerId) ?? null))
}

export async function getBusinessDetail(access: AccessContext, id: string): Promise<BusinessDetailDto> {
    const { doc, own } = await loadVisibleBusiness(access, id, { section: "ficha" })
    const [goals, days, names, email, locked, valued] = await Promise.all([
        businessModels().goals.find({ businessId: id, status: "active" }).sort({ createdAt: 1 }).lean<GoalDoc[]>(),
        retentionDays(),
        ownerNames([doc.ownerId]),
        ownerEmail(doc.ownerId),
        currencyLocked(id),
        valuedItems(id),
    ])
    return {
        ...toBusinessDto(doc, days, names.get(doc.ownerId) ?? null),
        goals: goals.map(toGoalDto),
        editable: own && canUseBusinesses(access) && doc.status === "active",
        actions: { edit: own && canBusiness(access, "businesses.edit") && doc.status === "active", archive: own && canBusiness(access, "businesses.archive"), delete: own && canBusiness(access, "businesses.delete") },
        own,
        accountEmail: email,
        currencyLocked: locked,
        valuedItems: valued,
    }
}

/** Negócio do dono efetivo para alteração (o suporte nunca altera negócios de terceiros). */
export async function loadOwnedForWrite(ownerId: string, id: string, session: ClientSession): Promise<BusinessDoc> {
    assertBusinessId(id)
    const doc = await businessModels().businesses.findById(id).session(session).lean<BusinessDoc>()
    if (!doc || doc.ownerId !== ownerId) throw businessNotFound()
    return doc
}

const conflict = () => new DomainError(409, "O negócio foi alterado por outra ação. Recarregue e revise antes de salvar.", "VERSION_CONFLICT")

export async function updateBusiness(access: AccessContext, id: string, raw: unknown): Promise<BusinessDetailDto> {
    const { version, ...patch } = parseInput(businessUpdateSchema, raw)
    if (!Object.keys(patch).length) throw new DomainError(400, "Nada para alterar", "VALIDATION_ERROR")
    await businessTransaction(access, ["businesses.use", "businesses.edit"], async (current, session, ownerId) => {
        const doc = await loadOwnedForWrite(ownerId, id, session)
        if ((doc.version ?? 0) !== version) throw conflict()
        if (doc.status !== "active") throw new DomainError(409, "Restaure o negócio antes de editar.", "BUSINESS_ARCHIVED")
        const next: Partial<BusinessRecord> = {}
        if (patch.name !== undefined) next.name = patch.name || autoBusinessName(doc.number)
        if (patch.type !== undefined) next.type = patch.type
        if (patch.subtype !== undefined) next.subtype = patch.subtype || null
        if (patch.segment !== undefined) next.segment = patch.segment || null
        if (patch.description !== undefined) next.description = patch.description || null
        if (patch.links !== undefined) next.links = [...new Set(patch.links)]
        if (patch.availability !== undefined) next.availability = [...patch.availability].sort((a, b) => a.weekday - b.weekday)
        if (patch.currency !== undefined && patch.currency !== doc.currency) {
            if (await currencyLocked(id, session)) throw new DomainError(409, "A moeda não pode mais ser trocada: o negócio já tem pedidos ou trabalhos.", "CURRENCY_LOCKED")
            next.currency = patch.currency
        }
        if (patch.theme !== undefined) next.theme = patch.theme
        if (patch.contactEmail !== undefined) next.contactEmail = patch.contactEmail || null
        if (patch.contactPhone !== undefined) next.contactPhone = patch.contactPhone || null
        if (patch.deadlineAlertDays !== undefined) next.deadlineAlertDays = patch.deadlineAlertDays
        if (patch.quoteValidityDays !== undefined) next.quoteValidityDays = patch.quoteValidityDays
        if (!Object.keys(next).length) return
        const before = Object.fromEntries(Object.keys(next).map((key) => [key, doc[key as keyof BusinessRecord]]))
        await businessModels().businesses.updateOne({ _id: doc._id, version }, { $set: { ...next, updatedBy: current.userId }, $inc: { version: 1 } }, { session })
        await auditBusiness(current, "business.update", id, before, next, session)
    })
    await publishBusinessesChanged(businessOwnerOf(access), id)
    return getBusinessDetail(access, id)
}

export async function archiveBusiness(access: AccessContext, id: string): Promise<BusinessDetailDto> {
    await businessTransaction(access, ["businesses.use", "businesses.archive"], async (current, session, ownerId) => {
        const doc = await loadOwnedForWrite(ownerId, id, session)
        if (doc.status === "archived") throw new DomainError(409, "O negócio já está arquivado.", "BUSINESS_ARCHIVED")
        await businessModels().businesses.updateOne({ _id: doc._id }, { $set: { status: "archived", archivedAt: new Date(), updatedBy: current.userId }, $inc: { version: 1 } }, { session })
        await auditBusiness(current, "business.archive", id, { status: "active" }, { status: "archived" }, session)
    })
    await publishBusinessesChanged(businessOwnerOf(access), id)
    return getBusinessDetail(access, id)
}

/** Restaurar exige vaga no limite do perfil. */
export async function restoreBusiness(access: AccessContext, id: string): Promise<BusinessDetailDto> {
    await businessTransaction(access, ["businesses.use", "businesses.archive"], async (current, session, ownerId) => {
        const doc = await loadOwnedForWrite(ownerId, id, session)
        if (doc.status === "active") throw new DomainError(409, "O negócio já está ativo.", "BUSINESS_ACTIVE")
        await assertBusinessVacancy(current, session)
        await businessModels().businesses.updateOne({ _id: doc._id }, { $set: { status: "active", archivedAt: null, updatedBy: current.userId }, $inc: { version: 1 } }, { session })
        await auditBusiness(current, "business.restore", id, { status: "archived" }, { status: "active" }, session)
    })
    await publishBusinessesChanged(businessOwnerOf(access), id)
    return getBusinessDetail(access, id)
}

/** Apaga os dados do negócio (itens do espaço, pedidos, trabalhos, arquivos e entrevista) na transação e devolve as chaves do storage para remover depois. */
async function deleteBusinessData(doc: BusinessDoc, session: ClientSession): Promise<string[]> {
    const models = businessModels()
    const id = doc._id.toString()
    const interviews = await models.interviews.find({ businessId: id }).select({ _id: 1 }).session(session).lean()
    const interviewIds = interviews.map((interview) => interview._id)
    const files = await models.interviewFiles.find({ interviewId: { $in: interviewIds } }).select({ key: 1, uploadKey: 1 }).session(session).lean()
    const spaceFiles = await models.files.find({ businessId: id }).select({ key: 1, uploadKey: 1 }).session(session).lean()
    await models.goals.deleteMany({ businessId: id }, { session })
    await models.activities.deleteMany({ businessId: id }, { session })
    await models.activityPrices.deleteMany({ businessId: id }, { session })
    await models.documents.deleteMany({ businessId: id }, { session })
    await models.successes.deleteMany({ businessId: id }, { session })
    // Portfólio (M5): a configuração (libera o slug) e os itens avulsos; as imagens saem com os arquivos.
    await models.portfolios.deleteMany({ businessId: id }, { session })
    await models.portfolioPublications.deleteMany({ businessId: id }, { session })
    await models.portfolioItems.deleteMany({ businessId: id }, { session })
    // Pedidos (com versões) e trabalhos (colunas, movimentações, notas e horas) do negócio; os clientes são do usuário e ficam.
    const orders = orderModels()
    await orders.orders.deleteMany({ businessId: id }, { session })
    await orders.orderVersions.deleteMany({ businessId: id }, { session })
    const works = workModels()
    await works.works.deleteMany({ businessId: id }, { session })
    await works.columns.deleteMany({ businessId: id }, { session })
    await works.layouts.deleteMany({ businessId: id }, { session })
    await works.moves.deleteMany({ businessId: id }, { session })
    await works.notes.deleteMany({ businessId: id }, { session })
    await works.timeEntries.deleteMany({ businessId: id }, { session })
    await models.files.deleteMany({ businessId: id }, { session })
    await models.interviewMessages.deleteMany({ interviewId: { $in: interviewIds } }, { session })
    await models.interviewFiles.deleteMany({ interviewId: { $in: interviewIds } }, { session })
    await models.interviews.deleteMany({ _id: { $in: interviewIds } }, { session })
    await models.businesses.deleteOne({ _id: doc._id }, { session })
    return [doc.logo?.key, ...[...files, ...spaceFiles].flatMap((file) => [file.key, file.uploadKey])].filter((key): key is string => Boolean(key))
}

export async function removeObjectsQuietly(keys: readonly string[]): Promise<number> {
    let failed = 0
    for (const key of new Set(keys)) {
        try {
            await deleteFile(key)
        } catch (error) {
            if (storageErrorInfo(error).kind === "not_found") continue
            failed += 1
            log.warn({ err: error, key }, "[negócios] falha ao remover objeto do storage")
        }
    }
    return failed
}

/** Exclusão definitiva manual: só arquivado, com confirmação na tela. Irreversível. */
export async function deleteBusiness(access: AccessContext, id: string): Promise<{ id: string }> {
    const keys = await businessTransaction(access, ["businesses.use", "businesses.delete"], async (current, session, ownerId) => {
        const doc = await loadOwnedForWrite(ownerId, id, session)
        if (doc.status !== "archived") throw new DomainError(409, "Arquive o negócio antes de excluí-lo definitivamente.", "BUSINESS_NOT_ARCHIVED")
        const removed = await deleteBusinessData(doc, session)
        await auditBusiness(current, "business.delete", id, { name: doc.name, ownerId: doc.ownerId }, null, session)
        return removed
    })
    await removeObjectsQuietly(keys)
    await publishBusinessesChanged(businessOwnerOf(access), id)
    return { id }
}

/**
 * Rotina `businesses-purge`: exclui definitivamente os negócios arquivados há mais do que o prazo
 * de Integrações › Plataforma (anexos no S3 inclusive). Ator de sistema na auditoria.
 */
export async function purgeArchivedBusinesses(now: Date = new Date()): Promise<string> {
    await dbConnect()
    await ensureBusinessCollections()
    const days = await retentionDays()
    const cutoff = new Date(now.getTime() - days * DAY_MS)
    const stale = await businessModels().businesses.find({ status: "archived", archivedAt: { $lte: cutoff } }).lean<BusinessDoc[]>()
    let removed = 0
    let storageFailures = 0
    for (const doc of stale) {
        const session = await mongoose.startSession()
        let keys: string[] = []
        let done = false
        try {
            await session.withTransaction(async () => {
                done = false
                const fresh = await businessModels().businesses.findOne({ _id: doc._id, status: "archived", archivedAt: { $lte: cutoff } }).session(session).lean<BusinessDoc>()
                if (!fresh) return
                keys = await deleteBusinessData(fresh, session)
                await accessModels().audits.create([{ actorId: "system:businesses-purge", action: "business.purge", targetId: doc._id.toString(), before: { name: fresh.name, ownerId: fresh.ownerId, archivedAt: fresh.archivedAt }, after: null }], { session })
                done = true
            })
        } finally {
            await session.endSession()
        }
        if (done) removed += 1
        storageFailures += await removeObjectsQuietly(keys)
        if (done) await publishBusinessesChanged(doc.ownerId, doc._id.toString())
    }
    if (!removed) return `Nenhum negócio arquivado há mais de ${days} dia(s)`
    return `${removed} negócio(s) excluído(s) definitivamente${storageFailures ? `; ${storageFailures} objeto(s) do storage com falha` : ""}`
}

/** Cria o negócio dentro da transação da conclusão da entrevista (vaga já conferida). */
export async function insertBusiness(
    current: AccessContext,
    session: ClientSession,
    ownerId: string,
    data: { name: string | null; type: BusinessRecord["type"]; subtype: string | null; segment: string | null; description: string | null; logo: BusinessLogo | null; links: string[]; availability: BusinessRecord["availability"]; currency: BusinessRecord["currency"]; interviewId: string },
    goals: readonly BusinessGoalInput[],
    businessId: Types.ObjectId = new Types.ObjectId(),
): Promise<string> {
    const models = businessModels()
    const state = await models.ownerStates.findOneAndUpdate({ _id: ownerId }, { $inc: { seq: 1 } }, { session, returnDocument: "after", upsert: true })
    const number = state!.seq
    const [business] = await models.businesses.create(
        [{ _id: businessId, ...data, ownerId, number, name: data.name?.trim() || autoBusinessName(number), status: "active", archivedAt: null, version: 0, createdBy: current.userId, updatedBy: current.userId }],
        { session },
    )
    const id = business!._id.toString()
    // Uma meta ativa por negócio: entrevistas antigas com várias metas ficam com a última ativa e as
    // demais no histórico (substituídas no mesmo instante).
    if (goals.length) {
        const now = new Date()
        const ids = goals.map(() => new Types.ObjectId())
        await models.goals.create(
            goals.map((goal, index) => {
                const last = index === goals.length - 1
                return {
                    _id: ids[index],
                    ...goal,
                    businessId: id,
                    ownerId,
                    status: last ? "active" : "superseded",
                    activePeriods: [{ from: now, to: last ? null : now }],
                    supersededAt: last ? null : now,
                    supersededBy: last ? null : ids[index + 1]!.toString(),
                    supersededReason: last ? null : "new",
                    createdBy: current.userId,
                }
            }),
            { session, ordered: true },
        )
    }
    return id
}

/** Logo do negócio por rota autenticada (dono ou suporte). */
export async function businessLogoContent(access: AccessContext, id: string): Promise<Response> {
    const { doc } = await loadVisibleBusiness(access, id, { audit: false })
    if (!doc.logo) throw new DomainError(404, "O negócio não tem logo", "BUSINESS_LOGO_NOT_FOUND")
    let file
    try {
        file = await getFileObject(doc.logo.key)
    } catch (error) {
        if (storageErrorInfo(error).kind === "not_found") throw new DomainError(404, "Logo não encontrada", "BUSINESS_LOGO_NOT_FOUND")
        throw new DomainError(502, "Não foi possível carregar a logo. Tente novamente em instantes.", "STORAGE_UNAVAILABLE")
    }
    const headers: Record<string, string> = {
        "Content-Type": doc.logo.mediaType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.logo.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
    }
    if (file.contentLength != null) headers["Content-Length"] = String(file.contentLength)
    return new Response(file.body, { status: 200, headers })
}
