import mongoose from "mongoose"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { parseInput } from "@/features/access/server/commands"
import { accessModels } from "@/features/access/server/models"
import type { AccessContext } from "@/features/access/server/context"
import { auditBusiness, businessOwnerOf, canBusiness, ensureBusinessCollections, requireModuleRead } from "@/features/businesses/server/access"
import { publishSpaceChanged, removeObjectsQuietly } from "@/features/businesses/server/businesses"
import { claimBusinessFiles, refOfFile, releaseBusinessFiles } from "@/features/businesses/server/files"
import { DAY_MS, readBusiness, writeItem } from "@/features/businesses/server/items"
import { businessModels } from "@/features/businesses/server/models"
import { totalMinutes } from "@/features/orders/logic"
import { orderModels, type OrderRecord } from "@/features/orders/server/models"
import { orderTotalCents, snapshotOf, type OrderDoc } from "@/features/orders/server/order-dto"
import { recordVersion, resolveItems } from "@/features/orders/server/orders"
import { DEFAULT_PAYMENT_METHODS, WORK_AUDIT, WORK_FILE_AUDIT } from "../constants"
import { moveFlowOf, paymentMethodOptions } from "../logic"
import { workAttachmentsSchema, workMoveSchema, workPaymentSchema, workUnpaySchema, workUpdateSchema } from "../schemas"
import type { WorkDetailDto, WorkListDto } from "../types"
import { assertColumn, assertWritable, jobsRetentionDays, loadOrderOf, loadWork, readWork, toWorkDetail, workArchived, workSummaries, type WorkDoc } from "./core"
import { workModels } from "./models"

/**
 * Trabalhos (M4) — SOMENTE servidor. Movimentação livre entre as colunas, exceto Pago: entrar em Pago
 * só pelo pagamento (data, valor recebido e forma) e sair só com confirmação (estorno do faturamento,
 * o registro fica no histórico). Os dados comerciais vivem no pedido aceito: editá-los pelo trabalho
 * grava uma versão `work` do pedido, nunca publicada (o link mostra a versão aceita).
 */

type ListQuery = { status?: "active" | "archived" | "all"; clientId?: string }

function statusFilter(status: ListQuery["status"]): Record<string, unknown> {
    return status === "all" ? {} : { status: status ?? "active" }
}

/** Trabalhos de um negócio (dono ou suporte). */
export async function listBusinessWorks(access: AccessContext, businessId: string, query: ListQuery = {}): Promise<WorkListDto> {
    const { editable } = await readBusiness(access, businessId, "works")
    const filter: Record<string, unknown> = { businessId, ...statusFilter(query.status) }
    if (query.clientId) filter.clientId = query.clientId
    const docs = await workModels().works.find(filter).sort({ position: 1 }).lean<WorkDoc[]>()
    return { items: await workSummaries(docs), editable }
}

/** Visão geral (`/trabalhos`): os trabalhos de todos os negócios do dono efetivo. */
export async function listWorks(access: AccessContext, query: ListQuery & { businessId?: string } = {}): Promise<WorkListDto> {
    requireModuleRead(access, "works")
    await dbConnect()
    await ensureBusinessCollections()
    const filter: Record<string, unknown> = { ownerId: businessOwnerOf(access), ...statusFilter(query.status) }
    if (query.businessId) filter.businessId = query.businessId
    if (query.clientId) filter.clientId = query.clientId
    const docs = await workModels().works.find(filter).sort({ position: 1 }).lean<WorkDoc[]>()
    return { items: await workSummaries(docs), editable: canBusiness(access, "works.edit") }
}

export async function getWork(access: AccessContext, businessId: string, workId: string): Promise<WorkDetailDto> {
    const { doc, editable } = await readWork(access, businessId, workId)
    return toWorkDetail(doc, { editable, viewerId: access.userId })
}

/** Movimentação registrada (origem, destino, ator real e a simulação). */
async function recordMove(session: mongoose.ClientSession, current: AccessContext, doc: WorkDoc, to: string): Promise<void> {
    await workModels().moves.create([{ workId: doc._id.toString(), businessId: doc.businessId, from: doc.column, to, actorId: current.userId, simulation: current.dto.simulation ?? null }], { session })
}

const endPosition = () => Date.now()

/** Mover (arrastar, teclado ou "Mover para…"); a mesma coluna com `position` reordena. */
export async function moveWork(access: AccessContext, businessId: string, workId: string, raw: unknown): Promise<WorkDetailDto> {
    const input = parseInput(workMoveSchema, raw)
    await writeItem(access, businessId, "works", async ({ current, session }) => {
        const doc = await loadWork(businessId, workId, session)
        assertWritable(doc, input.version)
        const flow = moveFlowOf(doc.column, input.column)
        if (flow === "pay") throw new DomainError(409, "Para mover para Pago, registre o pagamento (data, valor recebido e forma).", "WORK_PAYMENT_REQUIRED")
        if (flow === "unpay") throw new DomainError(409, "Sair de Pago exige confirmação: o trabalho sai do faturamento.", "WORK_UNPAY_REQUIRED")
        if (flow === "none") {
            if (input.position === undefined || input.position === doc.position) return { result: undefined }
            await workModels().works.updateOne({ _id: doc._id }, { $set: { position: input.position, updatedBy: current.userId }, $inc: { version: 1 } }, { session })
            return { result: undefined }
        }
        const toName = await assertColumn(businessId, input.column, session)
        await workModels().works.updateOne({ _id: doc._id }, { $set: { column: input.column, position: input.position ?? endPosition(), updatedBy: current.userId }, $inc: { version: 1 } }, { session })
        await recordMove(session, current, doc, input.column)
        await auditBusiness(current, `${WORK_AUDIT}.move`, workId, { businessId, code: doc.code, column: doc.column }, { businessId, code: doc.code, column: input.column, columnName: toName }, session)
        return { result: undefined }
    })
    return getWork(access, businessId, workId)
}

/**
 * Pago: registra o pagamento (entra em Pago) ou, num trabalho já pago, corrige data, valor e forma
 * (W4). O valor recebido é o do faturamento; a data é a usada nas metas.
 */
export async function markWorkPaid(access: AccessContext, businessId: string, workId: string, raw: unknown): Promise<WorkDetailDto> {
    const input = parseInput(workPaymentSchema, raw)
    await writeItem(access, businessId, "works", async ({ current, session }) => {
        const doc = await loadWork(businessId, workId, session)
        assertWritable(doc, input.version)
        const now = new Date()
        const method = input.method?.trim() || null
        const payment = { paidOn: input.paidOn, receivedCents: input.receivedCents, method, at: now, by: current.userId }
        const event = { paidOn: input.paidOn, receivedCents: input.receivedCents, method, at: now, actorId: current.userId }
        const before = doc.payment ? { paidOn: doc.payment.paidOn, receivedCents: doc.payment.receivedCents, method: doc.payment.method ?? null } : null
        if (doc.column === "paid" && doc.payment) {
            if (before && before.paidOn === input.paidOn && before.receivedCents === input.receivedCents && before.method === method) return { result: undefined }
            await workModels().works.updateOne({ _id: doc._id }, { $set: { payment, updatedBy: current.userId }, $push: { payments: { ...event, kind: "edited" } }, $inc: { version: 1 } }, { session })
            await auditBusiness(current, `${WORK_AUDIT}.payment_edit`, workId, { businessId, code: doc.code, ...before }, { businessId, code: doc.code, paidOn: input.paidOn, receivedCents: input.receivedCents, method }, session)
            return { result: undefined }
        }
        await workModels().works.updateOne(
            { _id: doc._id },
            { $set: { column: "paid", position: input.position ?? endPosition(), payment, updatedBy: current.userId }, $push: { payments: { ...event, kind: "marked" } }, $inc: { version: 1 } },
            { session },
        )
        await recordMove(session, current, doc, "paid")
        await auditBusiness(current, `${WORK_AUDIT}.pay`, workId, { businessId, code: doc.code, column: doc.column }, { businessId, code: doc.code, column: "paid", paidOn: input.paidOn, receivedCents: input.receivedCents, method }, session)
        return { result: undefined }
    }, ["works.payment"])
    return getWork(access, businessId, workId)
}

/** Sair de Pago (confirmação explícita): remove do faturamento; o pagamento fica no histórico. */
export async function unmarkWorkPaid(access: AccessContext, businessId: string, workId: string, raw: unknown): Promise<WorkDetailDto> {
    const input = parseInput(workUnpaySchema, raw)
    await writeItem(access, businessId, "works", async ({ current, session }) => {
        const doc = await loadWork(businessId, workId, session)
        assertWritable(doc, input.version)
        if (doc.column !== "paid") throw new DomainError(409, "O trabalho não está em Pago.", "WORK_NOT_PAID")
        if (input.column === "paid") throw new DomainError(400, "Escolha a coluna para onde o trabalho volta.", "WORK_COLUMN_NOT_FOUND")
        const toName = await assertColumn(businessId, input.column, session)
        const previous = doc.payment
        await workModels().works.updateOne(
            { _id: doc._id },
            {
                $set: { column: input.column, position: input.position ?? endPosition(), payment: null, updatedBy: current.userId },
                $push: { payments: { kind: "unmarked", paidOn: previous?.paidOn ?? null, receivedCents: previous?.receivedCents ?? null, method: previous?.method ?? null, at: new Date(), actorId: current.userId } },
                $inc: { version: 1 },
            },
            { session },
        )
        await recordMove(session, current, doc, input.column)
        await auditBusiness(
            current,
            `${WORK_AUDIT}.unpay`,
            workId,
            { businessId, code: doc.code, column: "paid", paidOn: previous?.paidOn ?? null, receivedCents: previous?.receivedCents ?? null },
            { businessId, code: doc.code, column: input.column, columnName: toName },
            session,
        )
        return { result: undefined }
    }, ["works.payment"])
    return getWork(access, businessId, workId)
}

/**
 * Dados comerciais pelo trabalho (W1): itens (horas estimadas), valor ajustado e prazo. Alteram o
 * pedido aceito com uma versão `work` NÃO publicada e atualizam a cópia do quadro.
 */
export async function updateWork(access: AccessContext, businessId: string, workId: string, raw: unknown): Promise<WorkDetailDto> {
    const { version, ...patch } = parseInput(workUpdateSchema, raw)
    if (!Object.keys(patch).length) throw new DomainError(400, "Nada para alterar", "VALIDATION_ERROR")
    let changed = false
    let ownerId = ""
    await writeItem(access, businessId, "works", async ({ current, session, ownerId: owner }) => {
        ownerId = owner
        const doc = await loadWork(businessId, workId, session)
        assertWritable(doc, version)
        const order = await loadOrderOf(doc, session)
        const next: Partial<OrderRecord> = {}
        if (patch.items !== undefined) {
            const items = await resolveItems(session, businessId, order.items ?? [], patch.items)
            if (JSON.stringify(items) !== JSON.stringify(order.items ?? [])) next.items = items
        }
        if (patch.totalOverrideCents !== undefined && (patch.totalOverrideCents ?? null) !== (order.totalOverrideCents ?? null)) next.totalOverrideCents = patch.totalOverrideCents ?? null
        if (patch.dueDate !== undefined && (patch.dueDate ?? null) !== (order.dueDate ?? null)) next.dueDate = patch.dueDate ?? null
        if (!Object.keys(next).length) return { result: undefined }
        const merged = { ...order, ...next } as OrderDoc
        await orderModels().orders.updateOne({ _id: order._id }, { $set: { ...next, updatedBy: current.userId }, $inc: { version: 1 } }, { session })
        await recordVersion(session, current, { ...merged, versionCount: order.versionCount ?? 0 }, snapshotOf(merged), "work", false)
        const copy = { estimatedMinutes: totalMinutes(merged.items ?? []), totalCents: orderTotalCents(merged), dueDate: merged.dueDate ?? null }
        await workModels().works.updateOne({ _id: doc._id }, { $set: { ...copy, updatedBy: current.userId }, $inc: { version: 1 } }, { session })
        await auditBusiness(
            current,
            `${WORK_AUDIT}.update`,
            workId,
            { businessId, code: doc.code, estimatedMinutes: doc.estimatedMinutes, totalCents: doc.totalCents, dueDate: doc.dueDate ?? null, items: (order.items ?? []).length },
            { businessId, code: doc.code, ...copy, items: (merged.items ?? []).length },
            session,
        )
        changed = true
        return { result: undefined }
    })
    if (changed) await publishSpaceChanged(ownerId, businessId, "orders")
    return getWork(access, businessId, workId)
}

/** Arquivar (desistência/cancelamento após o aceite) ou restaurar. Arquivado em Pago sai do faturamento. */
export async function setWorkStatus(access: AccessContext, businessId: string, workId: string, target: "active" | "archived"): Promise<WorkDetailDto> {
    await writeItem(access, businessId, "works", async ({ current, session }) => {
        const doc = await loadWork(businessId, workId, session)
        if (doc.status === target) throw new DomainError(409, target === "archived" ? "O trabalho já está arquivado." : "O trabalho já está ativo.", target === "archived" ? "WORK_ARCHIVED" : "WORK_ACTIVE")
        await workModels().works.updateOne({ _id: doc._id }, { $set: { status: target, archivedAt: target === "archived" ? new Date() : null, updatedBy: current.userId }, $inc: { version: 1 } }, { session })
        const revenue = doc.column === "paid" && doc.payment ? { paidOn: doc.payment.paidOn, receivedCents: doc.payment.receivedCents } : null
        await auditBusiness(current, `${WORK_AUDIT}.${target === "archived" ? "archive" : "restore"}`, workId, { businessId, code: doc.code, status: doc.status }, { businessId, code: doc.code, status: target, column: doc.column, revenue }, session)
        return { result: undefined }
    })
    return getWork(access, businessId, workId)
}

export const archiveWork = (access: AccessContext, businessId: string, workId: string) => setWorkStatus(access, businessId, workId, "archived")
export const restoreWork = (access: AccessContext, businessId: string, workId: string) => setWorkStatus(access, businessId, workId, "active")

/**
 * Apaga os dados do trabalho (W5): movimentações, notas, horas e anexos; o pedido continua Aceito
 * como registro (`workId: null` + `workDeletedAt`) e o sucesso ligado perde o vínculo.
 */
async function deleteWorkData(doc: WorkDoc, session: mongoose.ClientSession): Promise<string[]> {
    const id = doc._id.toString()
    const models = workModels()
    const files = await businessModels().files.find({ businessId: doc.businessId, purpose: "work", itemId: id }).select({ key: 1, uploadKey: 1 }).session(session).lean()
    await businessModels().files.deleteMany({ businessId: doc.businessId, purpose: "work", itemId: id }, { session })
    await models.moves.deleteMany({ workId: id }, { session })
    await models.notes.deleteMany({ workId: id }, { session })
    await models.timeEntries.deleteMany({ workId: id }, { session })
    await orderModels().orders.updateOne({ _id: doc.orderId, workId: id }, { $set: { workId: null, workDeletedAt: new Date() }, $inc: { version: 1 } }, { session })
    await businessModels().successes.updateMany({ businessId: doc.businessId, workId: id }, { $set: { workId: null } }, { session })
    await models.works.deleteOne({ _id: doc._id }, { session })
    return files.flatMap((file) => [file.key, file.uploadKey])
}

/** Exclusão definitiva manual: só arquivado (confirmação na tela). Irreversível. */
export async function deleteWork(access: AccessContext, businessId: string, workId: string): Promise<{ id: string }> {
    let ownerId = ""
    await writeItem(access, businessId, "works", async ({ current, session, ownerId: owner }) => {
        ownerId = owner
        const doc = await loadWork(businessId, workId, session)
        if (doc.status !== "archived") throw new DomainError(409, "Arquive o trabalho antes de excluí-lo definitivamente.", "WORK_NOT_ARCHIVED")
        const removeKeys = await deleteWorkData(doc, session)
        await auditBusiness(current, `${WORK_AUDIT}.delete`, workId, { businessId, code: doc.code, orderId: doc.orderId, column: doc.column, loggedMinutes: doc.loggedMinutes ?? 0 }, null, session)
        return { result: undefined, removeKeys }
    }, ["works.delete"])
    await publishSpaceChanged(ownerId, businessId, "orders")
    return { id: workId }
}

/** Rotina `businesses-purge`: trabalhos arquivados há mais do que o prazo de Trabalhos da Plataforma. */
export async function purgeArchivedWorks(now: Date = new Date()): Promise<string> {
    await dbConnect()
    await ensureBusinessCollections()
    const days = await jobsRetentionDays()
    const cutoff = new Date(now.getTime() - days * DAY_MS)
    const stale = await workModels().works.find({ status: "archived", archivedAt: { $lte: cutoff } }).lean<WorkDoc[]>()
    let removed = 0
    let storageFailures = 0
    const touched = new Map<string, string>()
    for (const doc of stale) {
        const session = await mongoose.startSession()
        let keys: string[] = []
        let done = false
        try {
            await session.withTransaction(async () => {
                done = false
                const fresh = await workModels().works.findOne({ _id: doc._id, status: "archived", archivedAt: { $lte: cutoff } }).session(session).lean<WorkDoc>()
                if (!fresh) return
                keys = await deleteWorkData(fresh, session)
                await accessModels().audits.create(
                    [{ actorId: "system:businesses-purge", action: `${WORK_AUDIT}.purge`, targetId: fresh._id.toString(), before: { businessId: fresh.businessId, code: fresh.code, orderId: fresh.orderId, archivedAt: fresh.archivedAt }, after: null }],
                    { session },
                )
                done = true
            })
        } finally {
            await session.endSession()
        }
        if (done) {
            removed += 1
            touched.set(doc.businessId, doc.ownerId)
        }
        storageFailures += await removeObjectsQuietly(keys)
    }
    for (const [businessId, ownerId] of touched) {
        await publishSpaceChanged(ownerId, businessId, "works")
        await publishSpaceChanged(ownerId, businessId, "orders")
    }
    if (!removed) return "Nenhum trabalho arquivado vencido"
    return `${removed} trabalho(s) excluído(s) definitivamente${storageFailures ? `; ${storageFailures} objeto(s) do storage com falha` : ""}`
}

// ── Anexos (entregáveis) ───────────────────────────────────────────────────

/** Vincula arquivos enviados (ou importados do chat) como anexos do trabalho. */
export async function addWorkAttachments(access: AccessContext, businessId: string, workId: string, raw: unknown): Promise<WorkDetailDto> {
    const input = parseInput(workAttachmentsSchema, raw)
    await writeItem(access, businessId, "works", async ({ current, session }) => {
        const doc = await loadWork(businessId, workId, session)
        if (doc.status !== "active") throw workArchived()
        const files = await claimBusinessFiles(session, businessId, "work", workId, input.fileIds)
        const refs = files.map(refOfFile)
        await workModels().works.updateOne({ _id: doc._id }, { $push: { attachments: { $each: refs } }, $set: { updatedBy: current.userId }, $inc: { version: 1 } }, { session })
        await auditBusiness(current, `${WORK_FILE_AUDIT}.add`, workId, null, { businessId, code: doc.code, files: refs.map((file) => file.name) }, session)
        return { result: undefined }
    })
    return getWork(access, businessId, workId)
}

export async function removeWorkAttachment(access: AccessContext, businessId: string, workId: string, fileId: string): Promise<WorkDetailDto> {
    await writeItem(access, businessId, "works", async ({ current, session }) => {
        const doc = await loadWork(businessId, workId, session)
        if (doc.status !== "active") throw workArchived()
        const file = (doc.attachments ?? []).find((entry) => entry.id === fileId)
        if (!file) throw new DomainError(404, "Anexo não encontrado neste trabalho", "BUSINESS_FILE_NOT_FOUND")
        const removeKeys = await releaseBusinessFiles(session, businessId, [fileId])
        await workModels().works.updateOne({ _id: doc._id }, { $pull: { attachments: { id: fileId } }, $set: { updatedBy: current.userId }, $inc: { version: 1 } }, { session })
        await auditBusiness(current, `${WORK_FILE_AUDIT}.remove`, workId, { businessId, code: doc.code, file: file.name }, null, session)
        return { result: undefined, removeKeys }
    })
    return getWork(access, businessId, workId)
}

// ── Formas de pagamento ────────────────────────────────────────────────────

/** Sugestões: as formas já usadas pelo dono em todos os negócios (mais recentes primeiro) + as padrão. */
export async function paymentMethodSuggestions(access: AccessContext): Promise<string[]> {
    requireModuleRead(access, "works")
    await dbConnect()
    const rows = await workModels().works.aggregate<{ _id: string }>([
        { $match: { ownerId: businessOwnerOf(access) } },
        { $unwind: "$payments" },
        { $match: { "payments.method": { $nin: [null, ""] } } },
        { $group: { _id: "$payments.method", at: { $max: "$payments.at" } } },
        { $sort: { at: -1 } },
        { $limit: 30 },
    ])
    return paymentMethodOptions(rows.map((row) => row._id), DEFAULT_PAYMENT_METHODS)
}

