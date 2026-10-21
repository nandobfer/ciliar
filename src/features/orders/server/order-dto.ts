import type { Types } from "mongoose"
import { todayKeyIn } from "@/lib/timezone"
import { DEFAULT_DEADLINE_ALERT_DAYS } from "@/features/businesses/constants"
import { businessModels } from "@/features/businesses/server/models"
import { toBusinessFileDto } from "@/features/businesses/server/files"
import { userNames } from "@/features/businesses/server/items"
import { displayOrderTitle, diffOrderSnapshots, itemSubtotalCents, quoteExpired, suggestedTotalCents, totalMinutes, type OrderSnapshot } from "../logic"
import type { OrderAction } from "../constants"
import type { OrderDecisionDto, OrderDto, OrderLinkDto, OrderSummaryDto, OrderVersionDto } from "../types"
import { orderModels, type OrderDecisionRecord, type OrderLinkRecord, type OrderRecord, type OrderVersionRecord } from "./models"

/** DTOs dos pedidos (SOMENTE servidor): resumo das listas, detalhe com versões e a cópia do cliente. */

export type OrderDoc = OrderRecord & { _id: Types.ObjectId }
export type OrderVersionDoc = OrderVersionRecord & { _id: Types.ObjectId }

export const orderTotalCents = (order: Pick<OrderRecord, "items" | "totalOverrideCents">) => order.totalOverrideCents ?? suggestedTotalCents(order.items ?? [])

/** O que o cliente vê agora (e o que cada versão guarda). */
export function snapshotOf(order: Pick<OrderRecord, "title" | "description" | "currency" | "items" | "totalOverrideCents" | "dueDate" | "attachments">): OrderSnapshot {
    return {
        title: displayOrderTitle(order),
        description: order.description,
        currency: order.currency,
        items: (order.items ?? []).map((item) => ({ activityName: item.activityName, minutes: item.minutes, hourlyRateCents: item.hourlyRateCents })),
        totalCents: orderTotalCents(order),
        totalManual: order.totalOverrideCents !== null && order.totalOverrideCents !== undefined,
        dueDate: order.dueDate ?? null,
        attachments: (order.attachments ?? []).filter((file) => file.clientVisible !== false).map((file) => ({ id: file.id, name: file.name })),
    }
}

export function linkDto(link: OrderLinkRecord | null | undefined, now: Date = new Date()): OrderLinkDto | null {
    if (!link) return null
    return {
        validUntil: link.validUntil,
        sentAt: new Date(link.sentAt).toISOString(),
        expired: quoteExpired(link.validUntil, todayKeyIn(link.timeZone, now)),
        emailedAt: link.emailedAt ? new Date(link.emailedAt).toISOString() : null,
    }
}

export function decisionDto(decision: OrderDecisionRecord, names: ReadonlyMap<string, string>): OrderDecisionDto {
    return {
        kind: decision.kind,
        by: decision.by,
        actorId: decision.actorId ?? null,
        actorName: decision.actorId ? (names.get(decision.actorId) ?? null) : null,
        name: decision.name ?? null,
        reason: decision.reason ?? null,
        ip: decision.ip ?? null,
        at: new Date(decision.at).toISOString(),
        versionNumber: decision.versionNumber ?? null,
    }
}

interface SummaryContext {
    businesses: Map<string, { name: string; deadlineAlertDays: number; quoteValidityDays: number }>
    clients: Map<string, string>
}

async function summaryContext(orders: readonly Pick<OrderDoc, "businessId" | "clientId">[]): Promise<SummaryContext> {
    const businessIds = [...new Set(orders.map((order) => order.businessId))]
    const clientIds = [...new Set(orders.map((order) => order.clientId))]
    const [businesses, clients] = await Promise.all([
        businessIds.length ? businessModels().businesses.find({ _id: { $in: businessIds } }).select({ name: 1, deadlineAlertDays: 1, quoteValidityDays: 1 }).lean() : [],
        clientIds.length ? orderModels().clients.find({ _id: { $in: clientIds } }).select({ name: 1 }).lean() : [],
    ])
    return {
        businesses: new Map(businesses.map((doc) => [String(doc._id), { name: doc.name, deadlineAlertDays: doc.deadlineAlertDays ?? DEFAULT_DEADLINE_ALERT_DAYS, quoteValidityDays: doc.quoteValidityDays ?? 15 }])),
        clients: new Map(clients.map((doc) => [String(doc._id), doc.name])),
    }
}

function toSummary(doc: OrderDoc, context: SummaryContext): OrderSummaryDto {
    const business = context.businesses.get(doc.businessId)
    return {
        id: doc._id.toString(),
        businessId: doc.businessId,
        businessName: business?.name ?? null,
        code: doc.code,
        number: doc.number,
        clientId: doc.clientId,
        clientName: context.clients.get(doc.clientId) ?? null,
        displayTitle: displayOrderTitle(doc),
        status: doc.status,
        currency: doc.currency,
        totalCents: orderTotalCents(doc),
        totalMinutes: totalMinutes(doc.items ?? []),
        dueDate: doc.dueDate ?? null,
        deadlineAlertDays: business?.deadlineAlertDays ?? DEFAULT_DEADLINE_ALERT_DAYS,
        link: linkDto(doc.link),
        workId: doc.workId ?? null,
        workDeletedAt: doc.workDeletedAt ? new Date(doc.workDeletedAt).toISOString() : null,
        createdAt: new Date(doc.createdAt).toISOString(),
        updatedAt: new Date(doc.updatedAt).toISOString(),
    }
}

export async function orderSummaries(docs: readonly OrderDoc[]): Promise<OrderSummaryDto[]> {
    const context = await summaryContext(docs)
    return docs.map((doc) => toSummary(doc, context))
}

/** Versões com as diferenças para a anterior (todas) — o prestador vê também os rascunhos. */
export function versionDtos(versions: readonly OrderVersionDoc[], names: ReadonlyMap<string, string>): OrderVersionDto[] {
    const sorted = [...versions].sort((a, b) => a.number - b.number)
    return sorted
        .map((version, index) => ({
            number: version.number,
            reason: version.reason,
            published: version.published === true,
            actorId: version.actorId ?? null,
            actorName: names.get(version.actorId) ?? null,
            snapshot: version.snapshot,
            changes: diffOrderSnapshots(index ? sorted[index - 1]!.snapshot : null, version.snapshot),
            createdAt: new Date(version.createdAt).toISOString(),
        }))
        .reverse()
}

export async function toOrderDto(doc: OrderDoc, options: { editable: boolean; actions: OrderAction[] }): Promise<OrderDto> {
    const id = doc._id.toString()
    const [context, versions] = await Promise.all([summaryContext([doc]), orderModels().orderVersions.find({ orderId: id }).lean<OrderVersionDoc[]>()])
    const names = await userNames([...versions.map((version) => version.actorId), ...(doc.decisions ?? []).flatMap((decision) => (decision.actorId ? [decision.actorId] : []))])
    const decisions = (doc.decisions ?? []).map((decision) => decisionDto(decision, names))
    const current = doc.status === "accepted" || doc.status === "rejected" ? (decisions.at(-1) ?? null) : null
    return {
        ...toSummary(doc, context),
        description: doc.description,
        title: doc.title ?? null,
        summary: doc.summary ?? null,
        titleManual: doc.titleManual === true,
        summaryManual: doc.summaryManual === true,
        aiStatus: doc.aiStatus ?? "idle",
        aiError: doc.aiError ?? null,
        items: (doc.items ?? []).map((item) => ({ ...item, subtotalCents: itemSubtotalCents(item.minutes, item.hourlyRateCents) })),
        suggestedTotalCents: suggestedTotalCents(doc.items ?? []),
        totalManual: doc.totalOverrideCents !== null && doc.totalOverrideCents !== undefined,
        attachments: (doc.attachments ?? []).map((file) => ({ ...toBusinessFileDto(doc.businessId, file), clientVisible: file.clientVisible !== false })),
        decision: current,
        decisions,
        versions: versionDtos(versions, names),
        firstSentAt: doc.firstSentAt ? new Date(doc.firstSentAt).toISOString() : null,
        cancelledAt: doc.cancelledAt ? new Date(doc.cancelledAt).toISOString() : null,
        version: doc.version ?? 0,
        editable: options.editable,
        actions: options.actions,
        quoteValidityDays: context.businesses.get(doc.businessId)?.quoteValidityDays ?? 15,
    }
}
