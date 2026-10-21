import { Types, type ClientSession } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { normalizeTimeZone, todayKeyIn } from "@/lib/timezone"
import { parseInput } from "@/features/access/server/commands"
import type { AccessContext } from "@/features/access/server/context"
import type { GoalSupersedeReason } from "../constants"
import { goalWindows, windowProgress, EMPTY_MEASUREMENT, type GoalProgress } from "../goal-progress"
import { goalSchema, type BusinessGoalInput } from "../schemas"
import { goalVersionSchema } from "../space-schemas"
import type { GoalArchiveResultDto, GoalItemDto, GoalsOverviewDto } from "../types"
import { auditBusiness } from "./access"
import { toGoalDto } from "./businesses"
import { auditAction, itemBaseDto, itemConflict, loadItem, readBusiness, retentionDaysOf, deleteItem, writeItem } from "./items"
import { businessModels, type BusinessGoalRecord, type GoalActivePeriod } from "./models"
import { measureGoalWindows } from "./revenue"

/**
 * Metas do negócio (M2): somente faturamento bruto e **uma meta ativa por negócio**. Criar uma meta,
 * editar a atual (cria uma nova versão) ou restaurar uma arquivada deixa a atual como `superseded`
 * (histórico, somente leitura). Arquivar a atual reativa a substituída mais recente (ou o negócio fica
 * sem meta). Cada meta guarda os períodos em que foi a ativa (`activePeriods`), base da linha do tempo
 * e do faturamento × meta. O progresso é calculado na hora, no fuso do navegador (padrão São Paulo).
 */

export type GoalDoc = BusinessGoalRecord & { _id: Types.ObjectId }

const GOAL_FIELDS = ["name", "targetCents", "period", "measure", "mode", "month", "year", "from", "to"] as const
export const ONE_ACTIVE_GOAL_INDEX = "one_active_goal_per_business"

const goalNotCurrent = (message = "Só a meta atual pode ser alterada: as do histórico são somente leitura.") => new DomainError(409, message, "GOAL_NOT_CURRENT")

/** Períodos ativos (metas antigas sem o campo: da criação até a substituição/arquivamento). */
export function periodsOf(doc: Pick<BusinessGoalRecord, "activePeriods" | "createdAt" | "status" | "supersededAt" | "archivedAt" | "updatedAt">): GoalActivePeriod[] {
    if (doc.activePeriods?.length) return doc.activePeriods.map((period) => ({ from: new Date(period.from), to: period.to ? new Date(period.to) : null }))
    return [{ from: new Date(doc.createdAt), to: doc.status === "active" ? null : new Date(doc.supersededAt ?? doc.archivedAt ?? doc.updatedAt) }]
}

const closePeriods = (periods: GoalActivePeriod[], at: Date) => periods.map((period) => (period.to ? period : { from: period.from, to: at }))

/** Último instante em que a meta esteve ativa (`now` se é a atual). */
export function lastActiveAt(doc: GoalDoc, now: Date = new Date()): Date {
    return new Date(Math.max(...periodsOf(doc).map((period) => (period.to ?? now).getTime())))
}

/** Progresso de cada meta: as fora de vigor só até o dia em que deixaram de ser a ativa. */
export async function goalsProgress(businessId: string, docs: readonly GoalDoc[], timeZone: string, now: Date = new Date()): Promise<Map<string, GoalProgress>> {
    const zone = normalizeTimeZone(timeZone)
    const today = todayKeyIn(zone, now)
    const plans = docs.map((doc) => {
        const periods = periodsOf(doc)
        const until = doc.status === "active" ? today : todayKeyIn(zone, lastActiveAt(doc, now))
        return { doc, windows: goalWindows(doc, until < today ? until : today, todayKeyIn(zone, periods[0]!.from)) }
    })
    const all = plans.flatMap((plan) => [plan.windows.current, ...plan.windows.history])
    const unique = [...new Map(all.map((window) => [window.key, window])).values()]
    const measurements = await measureGoalWindows(businessId, unique)
    return new Map(
        plans.map(({ doc, windows }) => {
            const measure = (key: string) => measurements.get(key) ?? EMPTY_MEASUREMENT
            return [
                doc._id.toString(),
                {
                    status: windows.status,
                    current: windowProgress(doc, windows.current, measure(windows.current.key)),
                    history: windows.history.map((window) => windowProgress(doc, window, measure(window.key))),
                },
            ]
        }),
    )
}

export function toGoalItemDto(doc: GoalDoc, retentionDays: number, progress: GoalProgress): GoalItemDto {
    return {
        ...toGoalDto(doc),
        ...itemBaseDto(doc, retentionDays),
        activePeriods: periodsOf(doc).map((period) => ({ from: period.from.toISOString(), to: period.to ? period.to.toISOString() : null })),
        supersededAt: doc.supersededAt ? new Date(doc.supersededAt).toISOString() : null,
        supersededReason: doc.supersededReason ?? null,
        progress,
    }
}

async function toDtos(businessId: string, docs: readonly GoalDoc[], timeZone: string): Promise<GoalItemDto[]> {
    const [days, progress] = await Promise.all([retentionDaysOf("goals"), goalsProgress(businessId, docs, timeZone)])
    return docs.map((doc) => toGoalItemDto(doc, days, progress.get(doc._id.toString())!))
}

/** Linha do tempo: a mais recente primeiro (pelo último instante em que esteve ativa). */
export function sortTimeline(docs: readonly GoalDoc[], now: Date = new Date()): GoalDoc[] {
    return [...docs].sort((a, b) => lastActiveAt(b, now).getTime() - lastActiveAt(a, now).getTime() || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

/** A meta atual e o histórico (substituídas e arquivadas). */
export async function listGoals(access: AccessContext, businessId: string, options: { timeZone?: string } = {}): Promise<GoalsOverviewDto> {
    const { editable } = await readBusiness(access, businessId, "goals")
    const docs = sortTimeline(await businessModels().goals.find({ businessId }).lean<GoalDoc[]>())
    const dtos = await toDtos(businessId, docs, options.timeZone ?? access.timeZone ?? "")
    return { current: dtos.find((goal) => goal.status === "active") ?? null, history: dtos.filter((goal) => goal.status !== "active"), editable }
}

export async function getGoal(access: AccessContext, businessId: string, goalId: string, timeZone?: string): Promise<GoalItemDto> {
    await readBusiness(access, businessId, "goals")
    const doc = (await loadItem(businessModels().goals, "goals", businessId, goalId, null)) as GoalDoc
    return (await toDtos(businessId, [doc], timeZone ?? access.timeZone ?? ""))[0]!
}

export async function getCurrentGoal(access: AccessContext, businessId: string, timeZone?: string): Promise<GoalItemDto | null> {
    await readBusiness(access, businessId, "goals")
    const doc = await businessModels().goals.findOne({ businessId, status: "active" }).lean<GoalDoc>()
    return doc ? (await toDtos(businessId, [doc], timeZone ?? access.timeZone ?? ""))[0]! : null
}

/** Tira a meta de vigor (vai para o histórico), conferindo a versão vista. */
async function supersede(doc: GoalDoc, by: string, reason: GoalSupersedeReason, now: Date, actorId: string, session: ClientSession): Promise<void> {
    const result = await businessModels().goals.updateOne(
        { _id: doc._id, status: "active", version: doc.version ?? 0 },
        { $set: { status: "superseded", supersededAt: now, supersededBy: by, supersededReason: reason, activePeriods: closePeriods(periodsOf(doc), now), updatedBy: actorId }, $inc: { version: 1 } },
        { session },
    )
    if (!result.modifiedCount) throw itemConflict()
}

async function supersedeCurrent(businessId: string, by: string, reason: GoalSupersedeReason, now: Date, actorId: string, session: ClientSession): Promise<GoalDoc | null> {
    const active = await businessModels().goals.findOne({ businessId, status: "active" }).session(session).lean<GoalDoc>()
    if (active) await supersede(active, by, reason, now, actorId, session)
    return active
}

async function insertActiveGoal(id: Types.ObjectId, goal: BusinessGoalInput, context: { businessId: string; ownerId: string; actorId: string; now: Date }, session: ClientSession): Promise<void> {
    await businessModels().goals.create(
        [{ _id: id, ...goal, businessId: context.businessId, ownerId: context.ownerId, status: "active", archivedAt: null, activePeriods: [{ from: context.now, to: null }], supersededAt: null, supersededBy: null, supersededReason: null, version: 0, createdBy: context.actorId, updatedBy: context.actorId }],
        { session },
    )
}

/** Nova meta: vira a atual; a anterior vai para o histórico. */
export async function createGoal(access: AccessContext, businessId: string, raw: unknown, timeZone?: string): Promise<GoalItemDto> {
    const goal = parseInput(goalSchema, raw)
    const id = await writeItem(access, businessId, "goals", async ({ current, session, ownerId }) => {
        const now = new Date()
        const newId = new Types.ObjectId()
        const replaced = await supersedeCurrent(businessId, newId.toString(), "new", now, current.userId, session)
        await insertActiveGoal(newId, goal, { businessId, ownerId, actorId: current.userId, now }, session)
        await auditBusiness(current, auditAction("goals", "create"), newId.toString(), null, { businessId, ...goal, replaces: replaced?._id.toString() ?? null }, session)
        return { result: newId.toString() }
    })
    return getGoal(access, businessId, id, timeZone)
}

/**
 * Editar a meta atual cria uma **nova versão** (a atual vai para o histórico como `edit`). Sem mudança
 * nenhuma, nada é gravado. Metas do histórico são somente leitura.
 */
export async function updateGoal(access: AccessContext, businessId: string, goalId: string, raw: unknown, timeZone?: string): Promise<GoalItemDto> {
    const { version } = parseInput(goalVersionSchema, raw)
    const goal = parseInput(goalSchema, raw)
    const id = await writeItem(access, businessId, "goals", async ({ current, session, ownerId }) => {
        const doc = (await loadItem(businessModels().goals, "goals", businessId, goalId, session)) as GoalDoc
        if (doc.status !== "active") throw goalNotCurrent()
        if ((doc.version ?? 0) !== version) throw itemConflict()
        const before = Object.fromEntries(GOAL_FIELDS.map((key) => [key, doc[key] ?? null]))
        const after = Object.fromEntries(GOAL_FIELDS.map((key) => [key, goal[key] ?? null]))
        if (GOAL_FIELDS.every((key) => before[key] === after[key])) return { result: goalId }
        const now = new Date()
        const newId = new Types.ObjectId()
        await supersede(doc, newId.toString(), "edit", now, current.userId, session)
        await insertActiveGoal(newId, goal, { businessId, ownerId, actorId: current.userId, now }, session)
        await auditBusiness(current, auditAction("goals", "update"), newId.toString(), { businessId, goalId, ...before }, { businessId, goalId: newId.toString(), ...after }, session)
        return { result: newId.toString() }
    })
    return getGoal(access, businessId, id, timeZone)
}

/** Arquiva a meta atual; a substituída mais recente volta a valer (ou o negócio fica sem meta). */
export async function archiveGoal(access: AccessContext, businessId: string, goalId: string, timeZone?: string): Promise<GoalArchiveResultDto> {
    const reactivated = await writeItem(access, businessId, "goals", async ({ current, session }) => {
        const goals = businessModels().goals
        const doc = (await loadItem(goals, "goals", businessId, goalId, session)) as GoalDoc
        if (doc.status === "archived") throw new DomainError(409, "A meta já está arquivada.", "ITEM_ARCHIVED")
        if (doc.status !== "active") throw goalNotCurrent("Metas do histórico são somente leitura: só a meta atual pode ser arquivada.")
        const now = new Date()
        const archived = await goals.updateOne(
            { _id: doc._id, status: "active", version: doc.version ?? 0 },
            { $set: { status: "archived", archivedAt: now, activePeriods: closePeriods(periodsOf(doc), now), updatedBy: current.userId }, $inc: { version: 1 } },
            { session },
        )
        if (!archived.modifiedCount) throw itemConflict()
        const previous = await goals.findOne({ businessId, status: "superseded" }).sort({ supersededAt: -1, _id: -1 }).session(session).lean<GoalDoc>()
        if (previous) {
            await goals.updateOne(
                { _id: previous._id },
                { $set: { status: "active", supersededAt: null, supersededBy: null, supersededReason: null, activePeriods: [...periodsOf(previous), { from: now, to: null }], updatedBy: current.userId }, $inc: { version: 1 } },
                { session },
            )
        }
        const reactivatedId = previous?._id.toString() ?? null
        await auditBusiness(current, auditAction("goals", "archive"), goalId, { businessId, status: "active" }, { businessId, status: "archived", reactivated: reactivatedId }, session)
        return { result: reactivatedId }
    })
    const [archivedDto, currentDto] = await Promise.all([getGoal(access, businessId, goalId, timeZone), reactivated ? getGoal(access, businessId, reactivated, timeZone) : null])
    return { archived: archivedDto, current: currentDto }
}

/** Restaura uma meta arquivada como a atual (a atual vai para o histórico). */
export async function restoreGoal(access: AccessContext, businessId: string, goalId: string, timeZone?: string): Promise<GoalItemDto> {
    await writeItem(access, businessId, "goals", async ({ current, session }) => {
        const goals = businessModels().goals
        const doc = (await loadItem(goals, "goals", businessId, goalId, session)) as GoalDoc
        if (doc.status === "active") throw new DomainError(409, "A meta já é a atual.", "ITEM_ACTIVE")
        if (doc.status !== "archived") throw goalNotCurrent("Metas substituídas ficam no histórico e não podem ser restauradas; crie uma meta nova.")
        const now = new Date()
        const replaced = await supersedeCurrent(businessId, goalId, "restore", now, current.userId, session)
        const restored = await goals.updateOne(
            { _id: doc._id, status: "archived", version: doc.version ?? 0 },
            { $set: { status: "active", archivedAt: null, activePeriods: [...periodsOf(doc), { from: now, to: null }], updatedBy: current.userId }, $inc: { version: 1 } },
            { session },
        )
        if (!restored.modifiedCount) throw itemConflict()
        await auditBusiness(current, auditAction("goals", "restore"), goalId, { businessId, status: "archived" }, { businessId, status: "active", replaces: replaced?._id.toString() ?? null }, session)
        return { result: undefined }
    })
    return getGoal(access, businessId, goalId, timeZone)
}

/** Exclusão definitiva manual: só meta arquivada (as substituídas ficam para sempre no histórico). */
export async function deleteGoal(access: AccessContext, businessId: string, goalId: string): Promise<{ id: string }> {
    return deleteItem(access, businessModels().goals, "goals", businessId, goalId, async () => [], (doc) => ({ name: doc.name, targetCents: doc.targetCents, period: doc.period }))
}

/**
 * Migração (boot, idempotente): negócios com várias metas ativas ficam com a mais recente ativa e as
 * outras substituídas (cada uma até a criação da seguinte); metas sem `activePeriods` ganham o
 * período pela criação/substituição/arquivamento. Só então cria o índice único da meta ativa.
 * Roda dentro de `runMigrations()`: não chame `dbConnect()` aqui (esperaria as próprias migrações).
 */
export async function ensureGoalIndexes(): Promise<{ superseded: number; backfilled: number }> {
    const goals = businessModels().goals
    let superseded = 0
    const groups = await goals.aggregate<{ _id: string; docs: { id: Types.ObjectId; createdAt: Date }[] }>([
        { $match: { status: "active" } },
        { $sort: { createdAt: 1, _id: 1 } },
        { $group: { _id: "$businessId", docs: { $push: { id: "$_id", createdAt: "$createdAt" } }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
    ])
    for (const group of groups) {
        for (let index = 0; index < group.docs.length - 1; index += 1) {
            const doc = group.docs[index]!
            const next = group.docs[index + 1]!
            await goals.updateOne(
                { _id: doc.id, status: "active" },
                { $set: { status: "superseded", supersededAt: next.createdAt, supersededBy: next.id.toString(), supersededReason: "new", activePeriods: [{ from: doc.createdAt, to: next.createdAt }] }, $inc: { version: 1 } },
            )
            superseded += 1
        }
    }
    const missing = await goals.find({ $or: [{ activePeriods: { $exists: false } }, { activePeriods: { $size: 0 } }] }).lean<GoalDoc[]>()
    for (const doc of missing) await goals.updateOne({ _id: doc._id }, { $set: { activePeriods: periodsOf({ ...doc, activePeriods: [] }) } })
    await goals.collection.createIndex({ businessId: 1 }, { name: ONE_ACTIVE_GOAL_INDEX, unique: true, partialFilterExpression: { status: "active" } })
    return { superseded, backfilled: missing.length }
}
