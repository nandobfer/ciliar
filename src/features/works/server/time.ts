import { Types, type ClientSession } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { normalizeTimeZone, todayKeyIn } from "@/lib/timezone"
import { parseInput } from "@/features/access/server/commands"
import type { AccessContext } from "@/features/access/server/context"
import { auditBusiness } from "@/features/businesses/server/access"
import { userNames, writeItem } from "@/features/businesses/server/items"
import { businessModels } from "@/features/businesses/server/models"
import { WORK_TIME_AUDIT, type TimeEntrySource } from "../constants"
import { timeEntryCreateSchema, timeEntryUpdateSchema } from "../schemas"
import type { TimeEntryDto } from "../types"
import { loadOrderOf, loadWork, readWork, toTimeEntryDto, workArchived, type TimeEntryDoc, type WorkDoc } from "./core"
import { workModels } from "./models"

/**
 * Apontamento manual de horas (M4 §5, sem cronômetro) — SOMENTE servidor. Cada lançamento tem o item
 * do pedido OU uma atividade do negócio fora do pedido (valor/hora congelado no lançamento), a data
 * trabalhada (não futura, no fuso do usuário), as horas `h:mm` e uma descrição opcional. A soma fica
 * em `loggedMinutes` do trabalho (barra do card e meta por hora).
 */

const entryNotFound = () => new DomainError(404, "Lançamento de horas não encontrado", "TIME_ENTRY_NOT_FOUND")
const entryConflict = () => new DomainError(409, "O lançamento foi alterado por outra ação. Recarregue e revise antes de salvar.", "VERSION_CONFLICT")

/** Item do lançamento: congela nome e valor/hora (item do pedido ou atividade ATIVA do negócio). */
async function resolveRef(session: ClientSession, work: WorkDoc, source: TimeEntrySource, refId: string): Promise<{ name: string; hourlyRateCents: number }> {
    if (source === "orderItem") {
        const order = await loadOrderOf(work, session)
        const item = (order.items ?? []).find((entry) => entry.id === refId)
        if (!item) throw new DomainError(400, "Item do pedido não encontrado: recarregue o trabalho.", "ORDER_ITEM_NOT_FOUND")
        return { name: item.activityName, hourlyRateCents: item.hourlyRateCents }
    }
    if (!Types.ObjectId.isValid(refId)) throw new DomainError(400, "Atividade não encontrada neste negócio.", "ACTIVITY_NOT_FOUND")
    const activity = await businessModels().activities.findOne({ _id: refId, businessId: work.businessId }).session(session).lean()
    if (!activity) throw new DomainError(400, "Atividade não encontrada neste negócio.", "ACTIVITY_NOT_FOUND")
    if (activity.status !== "active" || activity.active === false) throw new DomainError(409, `A atividade "${activity.name}" está inativa ou arquivada: só atividades ativas entram em novos lançamentos.`, "ACTIVITY_INACTIVE")
    return { name: activity.name, hourlyRateCents: activity.hourlyRateCents }
}

function assertNotFuture(access: AccessContext, date: string): void {
    if (date > todayKeyIn(normalizeTimeZone(access.timeZone))) throw new DomainError(400, "A data trabalhada não pode ser futura.", "TIME_ENTRY_FUTURE")
}

/** Recalcula a soma dos lançamentos no trabalho (na transação). */
async function syncLogged(session: ClientSession, work: WorkDoc, actorId: string): Promise<number> {
    const [row] = await workModels().timeEntries.aggregate<{ total: number }>([{ $match: { workId: work._id.toString() } }, { $group: { _id: null, total: { $sum: "$minutes" } } }]).session(session)
    const total = row?.total ?? 0
    await workModels().works.updateOne({ _id: work._id }, { $set: { loggedMinutes: total, updatedBy: actorId }, $inc: { version: 1 } }, { session })
    return total
}

async function loadEntry(work: WorkDoc, entryId: string, session: ClientSession): Promise<TimeEntryDoc> {
    if (!Types.ObjectId.isValid(entryId)) throw entryNotFound()
    const entry = await workModels().timeEntries.findOne({ _id: entryId, workId: work._id.toString() }).session(session).lean<TimeEntryDoc>()
    if (!entry) throw entryNotFound()
    return entry
}

export async function listTimeEntries(access: AccessContext, businessId: string, workId: string): Promise<TimeEntryDto[]> {
    const { doc } = await readWork(access, businessId, workId)
    const entries = await workModels().timeEntries.find({ workId: doc._id.toString() }).sort({ date: -1, createdAt: -1 }).lean<TimeEntryDoc[]>()
    const names = await userNames(entries.map((entry) => entry.authorId))
    return entries.map((entry) => toTimeEntryDto(entry, names))
}

async function entryDto(id: string): Promise<TimeEntryDto> {
    const entry = (await workModels().timeEntries.findById(id).lean<TimeEntryDoc>())!
    return toTimeEntryDto(entry, await userNames([entry.authorId]))
}

export async function createTimeEntry(access: AccessContext, businessId: string, workId: string, raw: unknown): Promise<TimeEntryDto> {
    const input = parseInput(timeEntryCreateSchema, raw)
    assertNotFuture(access, input.date)
    const id = await writeItem(access, businessId, "works", async ({ current, session, ownerId }) => {
        const work = await loadWork(businessId, workId, session)
        if (work.status !== "active") throw workArchived()
        const ref = await resolveRef(session, work, input.source, input.refId)
        const [created] = await workModels().timeEntries.create(
            [{ workId, businessId, ownerId, source: input.source, refId: input.refId, ...ref, date: input.date, minutes: input.minutes, description: input.description?.trim() || null, authorId: current.userId, version: 0 }],
            { session },
        )
        const total = await syncLogged(session, work, current.userId)
        await auditBusiness(current, `${WORK_TIME_AUDIT}.create`, created!._id.toString(), null, { businessId, workId, code: work.code, source: input.source, name: ref.name, hourlyRateCents: ref.hourlyRateCents, date: input.date, minutes: input.minutes, loggedMinutes: total }, session)
        return { result: created!._id.toString() }
    })
    return entryDto(id)
}

export async function updateTimeEntry(access: AccessContext, businessId: string, workId: string, entryId: string, raw: unknown): Promise<TimeEntryDto> {
    const { version, ...patch } = parseInput(timeEntryUpdateSchema, raw)
    if (patch.date) assertNotFuture(access, patch.date)
    if ((patch.source === undefined) !== (patch.refId === undefined)) throw new DomainError(400, "Informe a origem e o item juntos.", "VALIDATION_ERROR")
    await writeItem(access, businessId, "works", async ({ current, session }) => {
        const work = await loadWork(businessId, workId, session)
        if (work.status !== "active") throw workArchived()
        const entry = await loadEntry(work, entryId, session)
        if ((entry.version ?? 0) !== version) throw entryConflict()
        const next: Record<string, unknown> = {}
        if (patch.source && patch.refId && (patch.source !== entry.source || patch.refId !== entry.refId)) Object.assign(next, { source: patch.source, refId: patch.refId, ...(await resolveRef(session, work, patch.source, patch.refId)) })
        if (patch.date !== undefined && patch.date !== entry.date) next.date = patch.date
        if (patch.minutes !== undefined && patch.minutes !== entry.minutes) next.minutes = patch.minutes
        if (patch.description !== undefined && (patch.description?.trim() || null) !== (entry.description ?? null)) next.description = patch.description?.trim() || null
        if (!Object.keys(next).length) return { result: undefined }
        const updated = await workModels().timeEntries.updateOne({ _id: entry._id, version }, { $set: next, $inc: { version: 1 } }, { session })
        if (!updated.modifiedCount) throw entryConflict()
        const total = await syncLogged(session, work, current.userId)
        const before = Object.fromEntries(Object.keys(next).map((key) => [key, entry[key as keyof TimeEntryDoc] ?? null]))
        await auditBusiness(current, `${WORK_TIME_AUDIT}.update`, entryId, { businessId, workId, code: work.code, ...before }, { businessId, workId, code: work.code, ...next, loggedMinutes: total }, session)
        return { result: undefined }
    })
    return entryDto(entryId)
}

export async function deleteTimeEntry(access: AccessContext, businessId: string, workId: string, entryId: string): Promise<{ id: string }> {
    await writeItem(access, businessId, "works", async ({ current, session }) => {
        const work = await loadWork(businessId, workId, session)
        if (work.status !== "active") throw workArchived()
        const entry = await loadEntry(work, entryId, session)
        await workModels().timeEntries.deleteOne({ _id: entry._id }, { session })
        const total = await syncLogged(session, work, current.userId)
        await auditBusiness(current, `${WORK_TIME_AUDIT}.delete`, entryId, { businessId, workId, code: work.code, name: entry.name, date: entry.date, minutes: entry.minutes }, { loggedMinutes: total }, session)
        return { result: undefined }
    })
    return { id: entryId }
}
