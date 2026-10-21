import { Types, type ClientSession } from "mongoose"
import { DomainError } from "@/lib/api/route"
import type { AccessContext } from "@/features/access/server/context"
import { DEFAULT_DEADLINE_ALERT_DAYS } from "@/features/businesses/constants"
import { businessModels } from "@/features/businesses/server/models"
import { toBusinessFileDto } from "@/features/businesses/server/files"
import { DAY_MS, readBusiness, userNames } from "@/features/businesses/server/items"
import { loadPlatformState } from "@/features/platform/server/state"
import { displayOrderTitle, itemSubtotalCents, suggestedTotalCents } from "@/features/orders/logic"
import { orderModels } from "@/features/orders/server/models"
import { versionDtos, type OrderDoc, type OrderVersionDoc } from "@/features/orders/server/order-dto"
import { FIXED_WORK_COLUMNS, normalizeWorkLayout, type ColumnColor, type ColumnIcon, type WorkColumnDto } from "../board"
import { isFixedWorkColumn, WORK_COLUMN_LABELS, WORK_FIXED_COLUMNS } from "../constants"
import { timeEntryValueCents } from "../logic"
import type { TimeEntryDto, WorkDetailDto, WorkSummaryDto } from "../types"
import { workModels, type TimeEntryRecord, type WorkColumnRecord, type WorkRecord } from "./models"

/**
 * Núcleo dos Trabalhos (M4) — SOMENTE servidor: carregamento, quadro (fixas + customizadas) e DTOs.
 * Escritas em `works.ts`, `columns.ts`, `time.ts` e `notes.ts`, sempre por `writeItem` (negócio
 * ativo, fence do dono, acesso relido); leitura do dono ou do suporte (`businesses.view_all`).
 */

export type WorkDoc = WorkRecord & { _id: Types.ObjectId }
export type TimeEntryDoc = TimeEntryRecord & { _id: Types.ObjectId }
type ColumnDoc = WorkColumnRecord & { _id: Types.ObjectId }

export const workNotFound = () => new DomainError(404, "Trabalho não encontrado", "WORK_NOT_FOUND")
export const workConflict = () => new DomainError(409, "O trabalho foi alterado por outra ação. Recarregue e revise antes de salvar.", "VERSION_CONFLICT")
export const workArchived = () => new DomainError(409, "O trabalho está arquivado: restaure-o para alterar.", "WORK_ARCHIVED")

export function assertWorkId(id: string): void {
    if (!Types.ObjectId.isValid(id)) throw workNotFound()
}

export async function loadWork(businessId: string, workId: string, session: ClientSession | null): Promise<WorkDoc> {
    assertWorkId(workId)
    const doc = await workModels().works.findOne({ _id: workId, businessId }).session(session).lean<WorkDoc>()
    if (!doc) throw workNotFound()
    return doc
}

/** Trabalho editável: ativo e na versão que a tela/agente leu. */
export function assertWritable(doc: WorkDoc, version: number | undefined): void {
    if (version !== undefined && (doc.version ?? 0) !== version) throw workConflict()
    if (doc.status !== "active") throw workArchived()
}

export async function loadOrderOf(work: Pick<WorkDoc, "orderId" | "businessId">, session: ClientSession | null): Promise<OrderDoc> {
    const order = await orderModels().orders.findOne({ _id: work.orderId, businessId: work.businessId }).session(session).lean<OrderDoc>()
    if (!order) throw new DomainError(404, "Pedido do trabalho não encontrado", "ORDER_NOT_FOUND")
    return order
}

export const jobsRetentionDays = async () => (await loadPlatformState()).settings.retentionDays.jobs

// ── Quadro ─────────────────────────────────────────────────────────────────

const columnDto = (doc: Pick<ColumnDoc, "key" | "name" | "color" | "icon" | "description">): WorkColumnDto => ({
    key: doc.key,
    name: doc.name,
    color: doc.color as ColumnColor,
    icon: doc.icon as ColumnIcon,
    description: doc.description || null,
    fixed: false,
})

/** Quadro do negócio: as fixas e as customizadas, na ordem normalizada. */
export async function boardOf(businessId: string, session: ClientSession | null = null): Promise<{ columns: WorkColumnDto[]; layout: string[]; customs: ColumnDoc[] }> {
    const models = workModels()
    const [customs, layout] = await Promise.all([
        models.columns.find({ businessId }).sort({ createdAt: 1 }).session(session).lean<ColumnDoc[]>(),
        models.layouts.findOne({ businessId }).session(session).lean<{ order: string[] }>(),
    ])
    const order = normalizeWorkLayout(layout?.order ?? [], customs.map((column) => column.key))
    const byKey = new Map<string, WorkColumnDto>([...WORK_FIXED_COLUMNS.map((key) => [key, FIXED_WORK_COLUMNS[key]] as const), ...customs.map((column) => [column.key, columnDto(column)] as const)])
    return { columns: order.map((key) => byKey.get(key)!), layout: order, customs }
}

/** A coluna existe no quadro do negócio (fixa ou customizada)? */
export async function assertColumn(businessId: string, key: string, session: ClientSession): Promise<string> {
    if (isFixedWorkColumn(key)) return WORK_COLUMN_LABELS[key]
    const column = await workModels().columns.findOne({ businessId, key }).session(session).lean<ColumnDoc>()
    if (!column) throw new DomainError(400, "Coluna não encontrada neste negócio: recarregue o quadro.", "WORK_COLUMN_NOT_FOUND")
    return column.name
}

async function columnNames(businessIds: readonly string[]): Promise<Map<string, string>> {
    const ids = [...new Set(businessIds)]
    const customs = ids.length ? await workModels().columns.find({ businessId: { $in: ids } }).select({ businessId: 1, key: 1, name: 1 }).lean<ColumnDoc[]>() : []
    return new Map(customs.map((column) => [`${column.businessId}:${column.key}`, column.name]))
}

export const columnLabel = (names: ReadonlyMap<string, string>, businessId: string, key: string | null) =>
    !key ? null : isFixedWorkColumn(key) ? WORK_COLUMN_LABELS[key] : (names.get(`${businessId}:${key}`) ?? "Coluna excluída")

// ── DTOs ───────────────────────────────────────────────────────────────────

interface SummaryContext {
    businesses: Map<string, { name: string; deadlineAlertDays: number }>
    clients: Map<string, string>
    orders: Map<string, OrderDoc>
    columns: Map<string, string>
    retentionDays: number
}

async function summaryContext(docs: readonly WorkDoc[]): Promise<SummaryContext> {
    const businessIds = [...new Set(docs.map((doc) => doc.businessId))]
    const clientIds = [...new Set(docs.map((doc) => doc.clientId))].filter((id) => Types.ObjectId.isValid(id))
    const orderIds = [...new Set(docs.map((doc) => doc.orderId))].filter((id) => Types.ObjectId.isValid(id))
    const [businesses, clients, orders, columns, retentionDays] = await Promise.all([
        businessIds.length ? businessModels().businesses.find({ _id: { $in: businessIds } }).select({ name: 1, deadlineAlertDays: 1 }).lean() : [],
        clientIds.length ? orderModels().clients.find({ _id: { $in: clientIds } }).select({ name: 1 }).lean() : [],
        orderIds.length ? orderModels().orders.find({ _id: { $in: orderIds } }).lean<OrderDoc[]>() : [],
        columnNames(businessIds),
        jobsRetentionDays(),
    ])
    return {
        businesses: new Map(businesses.map((doc) => [String(doc._id), { name: doc.name, deadlineAlertDays: doc.deadlineAlertDays ?? DEFAULT_DEADLINE_ALERT_DAYS }])),
        clients: new Map(clients.map((doc) => [String(doc._id), doc.name])),
        orders: new Map(orders.map((doc) => [String(doc._id), doc])),
        columns,
        retentionDays,
    }
}

function toSummary(doc: WorkDoc, context: SummaryContext): WorkSummaryDto {
    const business = context.businesses.get(doc.businessId)
    const order = context.orders.get(doc.orderId)
    const archivedAt = doc.archivedAt ? new Date(doc.archivedAt) : null
    return {
        id: doc._id.toString(),
        businessId: doc.businessId,
        businessName: business?.name ?? null,
        orderId: doc.orderId,
        code: doc.code,
        title: order ? displayOrderTitle(order) : doc.code,
        clientId: doc.clientId,
        clientName: context.clients.get(doc.clientId) ?? null,
        column: doc.column,
        columnName: columnLabel(context.columns, doc.businessId, doc.column)!,
        position: doc.position ?? 0,
        estimatedMinutes: doc.estimatedMinutes ?? 0,
        loggedMinutes: doc.loggedMinutes ?? 0,
        totalCents: doc.totalCents ?? 0,
        currency: doc.currency,
        dueDate: doc.dueDate ?? null,
        deadlineAlertDays: business?.deadlineAlertDays ?? DEFAULT_DEADLINE_ALERT_DAYS,
        payment: doc.payment ? { paidOn: doc.payment.paidOn, receivedCents: doc.payment.receivedCents, method: doc.payment.method ?? null, at: new Date(doc.payment.at).toISOString() } : null,
        status: doc.status,
        archivedAt: archivedAt ? archivedAt.toISOString() : null,
        purgeAt: archivedAt && doc.status === "archived" ? new Date(archivedAt.getTime() + context.retentionDays * DAY_MS).toISOString() : null,
        successId: doc.successId ?? null,
        version: doc.version ?? 0,
        createdAt: new Date(doc.createdAt).toISOString(),
        updatedAt: new Date(doc.updatedAt).toISOString(),
    }
}

export async function workSummaries(docs: readonly WorkDoc[]): Promise<WorkSummaryDto[]> {
    const context = await summaryContext(docs)
    return docs.map((doc) => toSummary(doc, context))
}

export function toTimeEntryDto(entry: TimeEntryDoc, names: ReadonlyMap<string, string>): TimeEntryDto {
    return {
        id: entry._id.toString(),
        workId: entry.workId,
        source: entry.source,
        refId: entry.refId,
        name: entry.name,
        hourlyRateCents: entry.hourlyRateCents,
        valueCents: timeEntryValueCents(entry.minutes, entry.hourlyRateCents),
        date: entry.date,
        minutes: entry.minutes,
        description: entry.description ?? null,
        authorName: names.get(entry.authorId) ?? null,
        version: entry.version ?? 0,
        createdAt: new Date(entry.createdAt).toISOString(),
        updatedAt: new Date(entry.updatedAt).toISOString(),
    }
}

export async function toWorkDetail(doc: WorkDoc, options: { editable: boolean; viewerId: string }): Promise<WorkDetailDto> {
    const id = doc._id.toString()
    const models = workModels()
    const [context, order, versions, moves, notes, entries, success] = await Promise.all([
        summaryContext([doc]),
        orderModels().orders.findOne({ _id: doc.orderId }).lean<OrderDoc>(),
        orderModels().orderVersions.find({ orderId: doc.orderId }).lean<OrderVersionDoc[]>(),
        models.moves.find({ workId: id }).sort({ createdAt: -1, _id: -1 }).lean(),
        models.notes.find({ workId: id }).sort({ createdAt: -1, _id: -1 }).lean(),
        models.timeEntries.find({ workId: id }).sort({ date: -1, createdAt: -1 }).lean<TimeEntryDoc[]>(),
        doc.successId && Types.ObjectId.isValid(doc.successId) ? businessModels().successes.findOne({ _id: doc.successId, businessId: doc.businessId }).select({ title: 1, status: 1 }).lean() : null,
    ])
    const names = await userNames([
        ...versions.map((version) => version.actorId),
        ...moves.map((move) => move.actorId),
        ...notes.map((note) => note.authorId),
        ...entries.map((entry) => entry.authorId),
        ...(doc.payments ?? []).map((event) => event.actorId),
    ])
    const items = order?.items ?? []
    return {
        ...toSummary(doc, context),
        orderVersion: order?.version ?? 0,
        items: items.map((item) => ({ ...item, subtotalCents: itemSubtotalCents(item.minutes, item.hourlyRateCents) })),
        suggestedTotalCents: suggestedTotalCents(items),
        totalManual: order?.totalOverrideCents !== null && order?.totalOverrideCents !== undefined,
        versions: versionDtos(versions, names),
        payments: [...(doc.payments ?? [])].reverse().map((event) => ({
            kind: event.kind,
            paidOn: event.paidOn ?? null,
            receivedCents: event.receivedCents ?? null,
            method: event.method ?? null,
            at: new Date(event.at).toISOString(),
            actorName: names.get(event.actorId) ?? null,
        })),
        moves: moves.map((move) => ({
            id: String(move._id),
            from: move.from ?? null,
            fromName: columnLabel(context.columns, doc.businessId, move.from ?? null),
            to: move.to,
            toName: columnLabel(context.columns, doc.businessId, move.to)!,
            at: new Date(move.createdAt).toISOString(),
            actorName: names.get(move.actorId) ?? null,
            by: move.actorId === "client:link" ? "client" : move.actorId.startsWith("system:") ? "system" : "user",
        })),
        notes: notes.map((note) => ({
            id: String(note._id),
            authorId: note.authorId,
            authorName: names.get(note.authorId) ?? null,
            content: note.content,
            createdAt: new Date(note.createdAt).toISOString(),
            editedAt: note.editedAt ? new Date(note.editedAt).toISOString() : null,
            mine: note.authorId === options.viewerId,
        })),
        timeEntries: entries.map((entry) => toTimeEntryDto(entry, names)),
        attachments: (doc.attachments ?? []).map((file) => toBusinessFileDto(doc.businessId, file)),
        success: success ? { id: String(success._id), title: success.title, status: success.status === "archived" ? "archived" : "active" } : null,
        editable: options.editable && doc.status === "active",
    }
}

/** Leitura do trabalho (dono ou suporte, auditado com a seção). */
export async function readWork(access: AccessContext, businessId: string, workId: string): Promise<{ doc: WorkDoc; editable: boolean }> {
    const { editable } = await readBusiness(access, businessId, "works")
    return { doc: await loadWork(businessId, workId, null), editable }
}
