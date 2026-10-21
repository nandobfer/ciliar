import { z } from "zod"
import { objectId } from "@/features/access/schemas"
import { formatMoney } from "@/features/businesses/format"
import { archiveActivity, createActivity, deleteActivity, getActivity, listActivities, restoreActivity, updateActivity } from "@/features/businesses/server/activities"
import { getBusinessDetail } from "@/features/businesses/server/businesses"
import type { ActivityDto } from "@/features/businesses/types"
import { defineTool, OpexToolError } from "./define"

/** Atividades do negócio (M2). Os serviços conferem o dono efetivo e o suporte somente leitura. */

const businessId = objectId.describe("Id do negócio (de list_businesses)")
const activityId = objectId.describe("Id da atividade (de list_activities)")
const status = z.enum(["active", "archived", "all"]).default("active")

const slim = (activity: ActivityDto, currency: string) => ({
    id: activity.id,
    name: activity.name,
    category: activity.category,
    hourlyRateCents: activity.hourlyRateCents,
    hourlyRate: `${formatMoney(activity.hourlyRateCents, currency)}/hora`,
    active: activity.active,
    status: activity.status,
    archivedAt: activity.archivedAt,
    purgeAt: activity.purgeAt,
})

const fields = {
    name: z.string().trim().max(120),
    description: z.string().trim().max(4000).nullable().optional(),
    category: z.string().trim().max(60).nullable().optional().describe("Texto livre; prefira as categorias já usadas no negócio"),
    hourlyRateCents: z.number().int().describe("Valor por hora em unidades mínimas da moeda do negócio (ex.: R$ 150,00 = 15000)"),
    active: z.boolean().optional().describe("Inativa não aparece em novos pedidos"),
}

async function currencyOf(access: Parameters<typeof getBusinessDetail>[0], id: string) {
    return (await getBusinessDetail(access, id)).currency
}

export const businessActivityTools = [
    defineTool("list_activities", {
        input: z.object({ businessId, status }),
        execute: async (input, { access }) => {
            const [list, currency] = await Promise.all([listActivities(access, input.businessId, input.status), currencyOf(access, input.businessId)])
            return { currency, editable: list.editable, items: list.items.map((item) => ({ ...slim(item, currency), description: item.description })), categories: [...new Set(list.items.map((item) => item.category).filter(Boolean))] }
        },
    }),
    defineTool("get_activity", {
        input: z.object({ businessId, activityId }),
        execute: async (input, { access }) => {
            const [activity, currency] = await Promise.all([getActivity(access, input.businessId, input.activityId), currencyOf(access, input.businessId)])
            return { ...slim(activity, currency), description: activity.description, version: activity.version, priceHistory: activity.priceHistory.map((entry) => ({ ...entry, from: entry.fromCents === null ? null : formatMoney(entry.fromCents, currency), to: formatMoney(entry.toCents, currency) })) }
        },
    }),
    defineTool("create_activity", {
        input: z.object({ businessId, ...fields }),
        summarize: (input) => `Criar a atividade "${input.name}" (${input.hourlyRateCents} centavos/hora) no negócio ${input.businessId}`,
        execute: async ({ businessId: id, ...input }, { access }) => {
            const activity = await createActivity(access, id, { ...input, active: input.active ?? true })
            return slim(activity, await currencyOf(access, id))
        },
    }),
    defineTool("update_activity", {
        input: z.object({ businessId, activityId, name: fields.name.optional(), description: fields.description, category: fields.category, hourlyRateCents: fields.hourlyRateCents.optional(), active: fields.active }),
        summarize: (input) => `Editar a atividade ${input.activityId}: ${Object.keys(input).filter((key) => key !== "businessId" && key !== "activityId").join(", ") || "nada"}`,
        execute: async ({ businessId: id, activityId: itemId, ...patch }, { access }) => {
            if (!Object.keys(patch).length) throw new OpexToolError("Nada para alterar.")
            const current = await getActivity(access, id, itemId)
            const activity = await updateActivity(access, id, itemId, { ...patch, version: current.version })
            return slim(activity, await currencyOf(access, id))
        },
    }),
    defineTool("archive_activity", {
        input: z.object({ businessId, activityId }),
        summarize: (input) => `Arquivar a atividade ${input.activityId} (exclusão definitiva automática após o prazo da Plataforma)`,
        execute: async (input, { access }) => slim(await archiveActivity(access, input.businessId, input.activityId), await currencyOf(access, input.businessId)),
    }),
    defineTool("restore_activity", {
        input: z.object({ businessId, activityId }),
        summarize: (input) => `Restaurar a atividade ${input.activityId}`,
        execute: async (input, { access }) => slim(await restoreActivity(access, input.businessId, input.activityId), await currencyOf(access, input.businessId)),
    }),
    defineTool("delete_activity", {
        input: z.object({ businessId, activityId }),
        summarize: (input) => `Excluir definitivamente a atividade arquivada ${input.activityId}, com o histórico de preço (irreversível)`,
        execute: async (input, { access }) => ({ ok: true, ...(await deleteActivity(access, input.businessId, input.activityId)) }),
    }),
]
