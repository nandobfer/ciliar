import type { Types } from "mongoose"
import { DEFAULT_DEADLINE_ALERT_DAYS, DEFAULT_BUSINESS_PRIMARY } from "@/features/businesses/constants"
import { businessModels, type BusinessRecord } from "@/features/businesses/server/models"
import { displayOrderTitle } from "@/features/orders/logic"
import { orderModels } from "@/features/orders/server/models"
import type { OrderDoc } from "@/features/orders/server/order-dto"
import type { WorkDoc } from "@/features/works/server/core"
import { workModels } from "@/features/works/server/models"
import type { AvailabilityWindow, ConflictWork } from "../conflict"
import { dayKeyOf } from "../time"

/**
 * Dados do dono efetivo usados pelo calendário, pelo alerta de conflito e pela publicação no Google:
 * negócios ATIVOS (arquivado some do calendário e do expediente), trabalhos não arquivados e os
 * pedidos deles (data do aceite e título). O escopo do cálculo é sempre todos os negócios ativos.
 */

export type BusinessDoc = BusinessRecord & { _id: Types.ObjectId }

export interface OwnerScope {
    ownerId: string
    timeZone: string
    businesses: BusinessDoc[]
    businessById: Map<string, BusinessDoc>
    works: WorkDoc[]
    ordersOfWorks: Map<string, OrderDoc>
}

/** Trabalho em andamento: não arquivado e em qualquer coluna, exceto Pago. */
export const inProgress = (work: Pick<WorkDoc, "status" | "column">) => work.status === "active" && work.column !== "paid"

export const businessColor = (business: Pick<BusinessDoc, "theme"> | undefined) => business?.theme?.primaryColor || DEFAULT_BUSINESS_PRIMARY
export const alertDaysOf = (business: Pick<BusinessDoc, "deadlineAlertDays"> | undefined) => business?.deadlineAlertDays ?? DEFAULT_DEADLINE_ALERT_DAYS

/** Dia do aceite (início do período): a decisão de aceite no fuso; sem ela, a criação do trabalho. */
export function acceptanceKey(work: Pick<WorkDoc, "createdAt">, order: Pick<OrderDoc, "decisions"> | undefined, timeZone: string): string {
    const decision = [...(order?.decisions ?? [])].reverse().find((item) => item.kind === "accept")
    const at = decision?.at ?? work.createdAt
    return dayKeyOf(new Date(at).getTime(), timeZone)
}

export async function loadOwnerScope(ownerId: string, timeZone: string): Promise<OwnerScope> {
    const businesses = await businessModels().businesses.find({ ownerId, status: "active" }).sort({ createdAt: 1 }).lean<BusinessDoc[]>()
    const ids = businesses.map((business) => business._id.toString())
    const works = ids.length ? await workModels().works.find({ ownerId, businessId: { $in: ids }, status: "active" }).lean<WorkDoc[]>() : []
    const orderIds = [...new Set(works.map((work) => work.orderId))]
    const orders = orderIds.length ? await orderModels().orders.find({ _id: { $in: orderIds } }).select({ decisions: 1, title: 1, description: 1, titleManual: 1, code: 1, clientId: 1 }).lean<OrderDoc[]>() : []
    return {
        ownerId,
        timeZone,
        businesses,
        businessById: new Map(businesses.map((business) => [business._id.toString(), business])),
        works,
        ordersOfWorks: new Map(orders.map((order) => [order._id.toString(), order])),
    }
}

export const availabilitiesOf = (scope: Pick<OwnerScope, "businesses">): AvailabilityWindow[][] => scope.businesses.map((business) => (business.availability ?? []).map((day) => ({ weekday: day.weekday, start: day.start ?? null, end: day.end ?? null })))

export function workTitle(work: Pick<WorkDoc, "code" | "orderId">, scope: Pick<OwnerScope, "ordersOfWorks">): string {
    const order = scope.ordersOfWorks.get(work.orderId)
    return order ? displayOrderTitle(order) : work.code
}

/** Trabalhos em andamento no formato da função pura. */
export function conflictWorksOf(scope: OwnerScope): ConflictWork[] {
    return scope.works.filter(inProgress).map((work) => ({
        id: work._id.toString(),
        businessId: work.businessId,
        code: work.code,
        title: workTitle(work, scope),
        startKey: acceptanceKey(work, scope.ordersOfWorks.get(work.orderId), scope.timeZone),
        dueDate: work.dueDate ?? null,
        estimatedMinutes: work.estimatedMinutes ?? 0,
        loggedMinutes: work.loggedMinutes ?? 0,
    }))
}
