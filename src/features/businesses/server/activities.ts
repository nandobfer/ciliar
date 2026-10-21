import type { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { parseInput } from "@/features/access/server/commands"
import type { AccessContext } from "@/features/access/server/context"
import { activityCreateSchema, activityUpdateSchema } from "../space-schemas"
import type { ActivityDetailDto, ActivityDto, ItemListDto } from "../types"
import { auditBusiness } from "./access"
import { auditAction, deleteItem, itemArchived, itemBaseDto, itemCleanup, itemConflict, loadItem, readBusiness, retentionDaysOf, setItemStatus, userNames, writeItem } from "./items"
import { businessModels, type BusinessActivityRecord } from "./models"

/**
 * Atividades do negócio (M2): nome, descrição, categoria, valor por hora (unidades mínimas da moeda
 * do negócio) e ativa. Toda mudança do valor/hora vai para o histórico (anterior, novo, data, ator
 * real). Pedidos/trabalhos (M3/M4) guardam o valor da época: mudar a atividade não altera o que existe.
 */

type ActivityDoc = BusinessActivityRecord & { _id: Types.ObjectId }

export function toActivityDto(doc: ActivityDoc, retentionDays: number): ActivityDto {
    return {
        ...itemBaseDto(doc, retentionDays),
        name: doc.name,
        description: doc.description ?? null,
        category: doc.category ?? null,
        hourlyRateCents: doc.hourlyRateCents,
        active: doc.active !== false,
    }
}

export async function listActivities(access: AccessContext, businessId: string, status: "active" | "archived" | "all" = "all"): Promise<ItemListDto<ActivityDto>> {
    const { editable } = await readBusiness(access, businessId, "activities")
    const [docs, days] = await Promise.all([
        businessModels().activities.find({ businessId, ...(status === "all" ? {} : { status }) }).sort({ status: 1, name: 1 }).collation({ locale: "pt" }).lean<ActivityDoc[]>(),
        retentionDaysOf("activities"),
    ])
    return { items: docs.map((doc) => toActivityDto(doc, days)), editable }
}

export async function getActivity(access: AccessContext, businessId: string, activityId: string): Promise<ActivityDetailDto> {
    await readBusiness(access, businessId, "activities")
    const models = businessModels()
    const doc = await loadItem(models.activities, "activities", businessId, activityId, null)
    const [history, days] = await Promise.all([models.activityPrices.find({ activityId }).sort({ createdAt: -1, _id: -1 }).lean(), retentionDaysOf("activities")])
    const names = await userNames(history.map((entry) => entry.actorId))
    return {
        ...toActivityDto(doc as ActivityDoc, days),
        priceHistory: history.map((entry) => ({ fromCents: entry.fromCents ?? null, toCents: entry.toCents, actorId: entry.actorId, actorName: names.get(entry.actorId) ?? null, at: new Date(entry.createdAt).toISOString() })),
    }
}

export async function createActivity(access: AccessContext, businessId: string, raw: unknown): Promise<ActivityDetailDto> {
    const input = parseInput(activityCreateSchema, raw)
    const id = await writeItem(access, businessId, "activities", async ({ current, session, ownerId }) => {
        const models = businessModels()
        const [created] = await models.activities.create(
            [{ businessId, ownerId, name: input.name, description: input.description || null, category: input.category || null, hourlyRateCents: input.hourlyRateCents, active: input.active, status: "active", archivedAt: null, version: 0, createdBy: current.userId, updatedBy: current.userId }],
            { session },
        )
        const activityId = created!._id.toString()
        await models.activityPrices.create([{ activityId, businessId, fromCents: null, toCents: input.hourlyRateCents, actorId: current.userId, simulation: current.dto.simulation ?? null }], { session })
        await auditBusiness(current, auditAction("activities", "create"), activityId, null, { businessId, ...input }, session)
        return { result: activityId }
    })
    return getActivity(access, businessId, id)
}

export async function updateActivity(access: AccessContext, businessId: string, activityId: string, raw: unknown): Promise<ActivityDetailDto> {
    const { version, ...patch } = parseInput(activityUpdateSchema, raw)
    if (!Object.keys(patch).length) throw new DomainError(400, "Nada para alterar", "VALIDATION_ERROR")
    await writeItem(access, businessId, "activities", async ({ current, session }) => {
        const models = businessModels()
        const doc = (await loadItem(models.activities, "activities", businessId, activityId, session)) as ActivityDoc
        if ((doc.version ?? 0) !== version) throw itemConflict()
        if (doc.status !== "active") throw itemArchived()
        const next: Partial<BusinessActivityRecord> = {}
        if (patch.name !== undefined) next.name = patch.name
        if (patch.description !== undefined) next.description = patch.description || null
        if (patch.category !== undefined) next.category = patch.category || null
        if (patch.active !== undefined) next.active = patch.active
        const priceChanged = patch.hourlyRateCents !== undefined && patch.hourlyRateCents !== doc.hourlyRateCents
        if (priceChanged) next.hourlyRateCents = patch.hourlyRateCents
        if (!Object.keys(next).length) return { result: undefined }
        const before = Object.fromEntries(Object.keys(next).map((key) => [key, doc[key as keyof BusinessActivityRecord]]))
        const updated = await models.activities.updateOne({ _id: doc._id, version }, { $set: { ...next, updatedBy: current.userId }, $inc: { version: 1 } }, { session })
        if (!updated.modifiedCount) throw itemConflict()
        if (priceChanged) await models.activityPrices.create([{ activityId, businessId, fromCents: doc.hourlyRateCents, toCents: patch.hourlyRateCents!, actorId: current.userId, simulation: current.dto.simulation ?? null }], { session })
        await auditBusiness(current, auditAction("activities", "update"), activityId, { businessId, ...before }, { businessId, ...next }, session)
        return { result: undefined }
    })
    return getActivity(access, businessId, activityId)
}

export async function archiveActivity(access: AccessContext, businessId: string, activityId: string): Promise<ActivityDetailDto> {
    await setItemStatus(access, businessModels().activities, "activities", businessId, activityId, "archived")
    return getActivity(access, businessId, activityId)
}

export async function restoreActivity(access: AccessContext, businessId: string, activityId: string): Promise<ActivityDetailDto> {
    await setItemStatus(access, businessModels().activities, "activities", businessId, activityId, "active")
    return getActivity(access, businessId, activityId)
}

export async function deleteActivity(access: AccessContext, businessId: string, activityId: string): Promise<{ id: string }> {
    return deleteItem(access, businessModels().activities, "activities", businessId, activityId, (doc, session) => itemCleanup("activities", doc, session), (doc) => ({ name: doc.name, hourlyRateCents: doc.hourlyRateCents }))
}
