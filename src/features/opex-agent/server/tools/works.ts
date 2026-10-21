import { z } from "zod"
import { normalizeTimeZone, todayKeyIn } from "@/lib/timezone"
import { objectId } from "@/features/access/schemas"
import type { AccessContext } from "@/features/access/server/context"
import { importChatFile } from "@/features/businesses/server/files"
import { createSuccess } from "@/features/businesses/server/successes"
import { COLUMN_COLORS, COLUMN_ICON_KEYS, type WorkBoardDto } from "@/features/works/board"
import { TIME_ENTRY_SOURCES } from "@/features/works/constants"
import { createWorkColumn, deleteWorkColumn, getWorkBoard, reorderWorkColumns, updateWorkColumn } from "@/features/works/server/columns"
import { addWorkNote, deleteWorkNote, updateWorkNote } from "@/features/works/server/notes"
import { createTimeEntry, deleteTimeEntry, listTimeEntries, updateTimeEntry } from "@/features/works/server/time"
import { addWorkAttachments, archiveWork, deleteWork, getWork, listBusinessWorks, listWorks, markWorkPaid, moveWork, restoreWork, unmarkWorkPaid, updateWork } from "@/features/works/server/works"
import type { WorkDetailDto, WorkSummaryDto } from "@/features/works/types"
import { loadSessionFile } from "../files"
import { defineTool, OpexToolError } from "./define"

/**
 * Trabalhos (M4): colunas do quadro, trabalhos (mover, Pago, editar, arquivar), horas, notas, anexos e
 * "Converter em Sucesso". Executam os serviços reais com o acesso revalidado (nunca HTTP).
 */

const businessId = objectId.describe("Id do negócio (de list_businesses)")
const workId = objectId.describe("Id do trabalho (de list_works)")
const columnKey = z.string().trim().min(1).max(40).describe("Chave da coluna (de list_work_columns): opening, execution, validation, paid ou col-…")
const columnFields = {
    name: z.string().trim().min(1).max(40),
    color: z.enum(COLUMN_COLORS),
    icon: z.enum(COLUMN_ICON_KEYS).default("star"),
    description: z.string().trim().max(200).default(""),
}

const board = (dto: WorkBoardDto) => ({
    businessId: dto.businessId,
    editable: dto.editable,
    columns: dto.columns.map((column) => ({ key: column.key, name: column.name, fixed: column.fixed, color: column.color, icon: column.icon, description: column.description, works: dto.counts[column.key] ?? 0 })),
    layout: dto.layout,
})

const summary = (work: WorkSummaryDto) => ({
    id: work.id,
    businessId: work.businessId,
    businessName: work.businessName,
    orderId: work.orderId,
    code: work.code,
    title: work.title,
    clientId: work.clientId,
    clientName: work.clientName,
    column: work.column,
    columnName: work.columnName,
    currency: work.currency,
    totalCents: work.totalCents,
    dueDate: work.dueDate,
    estimatedMinutes: work.estimatedMinutes,
    loggedMinutes: work.loggedMinutes,
    payment: work.payment,
    status: work.status,
    successId: work.successId,
})

const detail = (work: WorkDetailDto) => ({
    ...summary(work),
    items: work.items.map((item) => ({ itemId: item.id, activityId: item.activityId, activityName: item.activityName, minutes: item.minutes, hourlyRateCents: item.hourlyRateCents, subtotalCents: item.subtotalCents })),
    suggestedTotalCents: work.suggestedTotalCents,
    totalManual: work.totalManual,
    timeEntries: work.timeEntries.map((entry) => ({ id: entry.id, source: entry.source, refId: entry.refId, name: entry.name, hourlyRateCents: entry.hourlyRateCents, date: entry.date, minutes: entry.minutes, description: entry.description, authorName: entry.authorName })),
    notes: work.notes.map((note) => ({ id: note.id, authorName: note.authorName, mine: note.mine, content: note.content, createdAt: note.createdAt, editedAt: note.editedAt })),
    attachments: work.attachments.map((file) => ({ id: file.id, name: file.name, mediaType: file.mediaType, size: file.size })),
    payments: work.payments,
    moves: work.moves.map((move) => ({ from: move.fromName, to: move.toName, at: move.at, actorName: move.actorName })),
    versions: work.versions.map((version) => ({ number: version.number, reason: version.reason, published: version.published, createdAt: version.createdAt, actorName: version.actorName, changes: version.changes })),
    success: work.success,
    editable: work.editable,
})

const minutesField = z.number().int().min(1).max(1440).describe("Horas em minutos (ex.: 90 = 1h30; até 1440)")
const dateField = z.string().describe("AAAA-MM-DD")
const today = (access: AccessContext) => todayKeyIn(normalizeTimeZone(access.timeZone))
const versionOf = async (access: AccessContext, business: string, work: string) => (await getWork(access, business, work)).version

export const workColumnTools = [
    defineTool("list_work_columns", {
        input: z.object({ businessId }),
        execute: async (input, { access }) => board(await getWorkBoard(access, input.businessId)),
    }),
    defineTool("create_work_column", {
        input: z.object({ businessId, ...columnFields, afterKey: columnKey.nullable().optional().describe("Coluna depois da qual a nova entra (sem ela: antes de Pago)") }),
        summarize: (input) => `Criar a coluna "${input.name}" no quadro de trabalhos do negócio ${input.businessId}`,
        execute: async ({ businessId: id, ...input }, { access }) => board(await createWorkColumn(access, id, input)),
    }),
    defineTool("update_work_column", {
        input: z.object({ businessId, key: columnKey, ...columnFields }),
        summarize: (input) => `Editar a coluna ${input.key} (nome "${input.name}")`,
        execute: async ({ businessId: id, key, ...input }, { access }) => board(await updateWorkColumn(access, id, key, input)),
    }),
    defineTool("reorder_work_columns", {
        input: z.object({ businessId, order: z.array(columnKey).min(4).max(40).describe("Ordem COMPLETA das chaves") }),
        summarize: (input) => `Reordenar as colunas do quadro: ${input.order.join(" → ")}`,
        execute: async (input, { access }) => board(await reorderWorkColumns(access, input.businessId, { order: input.order })),
    }),
    defineTool("delete_work_column", {
        input: z.object({ businessId, key: columnKey }),
        summarize: (input) => `Excluir a coluna vazia ${input.key} do quadro de trabalhos`,
        execute: async (input, { access }) => board(await deleteWorkColumn(access, input.businessId, input.key)),
    }),
]

export const workTools = [
    defineTool("list_works", {
        input: z.object({ businessId: businessId.optional(), clientId: objectId.optional(), status: z.enum(["active", "archived", "all"]).default("active") }),
        execute: async (input, { access }) => {
            const list = input.businessId ? await listBusinessWorks(access, input.businessId, { status: input.status, clientId: input.clientId }) : await listWorks(access, input)
            return { editable: list.editable, items: list.items.map(summary) }
        },
    }),
    defineTool("get_work", {
        input: z.object({ businessId, workId }),
        execute: async (input, { access }) => detail(await getWork(access, input.businessId, input.workId)),
    }),
    defineTool("move_work", {
        input: z.object({ businessId, workId, column: columnKey }),
        authorize: (input) => {
            if (input.column === "paid") throw new OpexToolError("Para mover para Pago use mark_work_paid (data, valor recebido e forma de pagamento).")
        },
        summarize: (input) => `Mover o trabalho ${input.workId} para a coluna ${input.column}`,
        execute: async (input, { access }) => {
            const current = await getWork(access, input.businessId, input.workId)
            if (current.column === "paid") throw new OpexToolError("O trabalho está em Pago: para tirá-lo use unmark_work_paid (sai do faturamento).")
            return summary(await moveWork(access, input.businessId, input.workId, { column: input.column, version: current.version }))
        },
    }),
    defineTool("mark_work_paid", {
        input: z.object({
            businessId,
            workId,
            paidOn: dateField.optional().describe("Data do pagamento AAAA-MM-DD (padrão: hoje)"),
            receivedCents: z.number().int().min(0).optional().describe("Valor recebido em unidades mínimas (padrão: o valor do pedido)"),
            method: z.string().trim().max(60).nullable().optional().describe("Forma de pagamento (PIX, transferência…)"),
        }),
        summarize: (input) => `Registrar o pagamento do trabalho ${input.workId}${input.paidOn ? ` em ${input.paidOn.split("-").reverse().join("/")}` : " (hoje)"}${input.receivedCents !== undefined ? `, valor ${(input.receivedCents / 100).toFixed(2)}` : ", valor do pedido"}${input.method ? `, ${input.method}` : ""}`,
        execute: async (input, { access }) => {
            const current = await getWork(access, input.businessId, input.workId)
            const paidOn = input.paidOn ?? current.payment?.paidOn ?? today(access)
            const receivedCents = input.receivedCents ?? current.payment?.receivedCents ?? current.totalCents
            const method = input.method !== undefined ? input.method : (current.payment?.method ?? null)
            return summary(await markWorkPaid(access, input.businessId, input.workId, { paidOn, receivedCents, method, version: current.version }))
        },
    }),
    defineTool("unmark_work_paid", {
        input: z.object({ businessId, workId, column: columnKey.describe("Coluna para onde o trabalho volta (não pode ser paid)") }),
        summarize: (input) => `Tirar o trabalho ${input.workId} de Pago (vai para ${input.column} e sai do faturamento)`,
        execute: async (input, { access }) => summary(await unmarkWorkPaid(access, input.businessId, input.workId, { column: input.column, confirm: true, version: await versionOf(access, input.businessId, input.workId) })),
    }),
    defineTool("update_work", {
        input: z.object({
            businessId,
            workId,
            items: z
                .array(
                    z.object({
                        itemId: z.string().max(40).optional().describe("Id de um item atual (de get_work)"),
                        activityId: objectId.optional().describe("Atividade ATIVA para um item novo (o valor/hora é copiado agora)"),
                        minutes: z.number().int().min(0).describe("Horas estimadas em minutos"),
                    }),
                )
                .max(50)
                .optional()
                .describe("Lista COMPLETA dos itens"),
            totalOverrideCents: z.number().int().min(0).nullable().optional().describe("Valor ajustado; null volta ao calculado"),
            dueDate: dateField.nullable().optional().describe("Prazo AAAA-MM-DD; null remove"),
        }),
        summarize: (input) => `Editar o trabalho ${input.workId}: ${["items", "totalOverrideCents", "dueDate"].filter((key) => input[key as keyof typeof input] !== undefined).join(", ") || "nada"}`,
        execute: async ({ businessId: id, workId: work, items, ...patch }, { access }) => {
            const body = { ...patch, ...(items ? { items: items.map((item) => (item.itemId ? { id: item.itemId, minutes: item.minutes } : { activityId: item.activityId, minutes: item.minutes })) } : {}) }
            if (!Object.keys(body).length) throw new OpexToolError("Nada para alterar.")
            return detail(await updateWork(access, id, work, { ...body, version: await versionOf(access, id, work) }))
        },
    }),
    defineTool("archive_work", {
        input: z.object({ businessId, workId }),
        summarize: (input) => `Arquivar o trabalho ${input.workId} (se estiver em Pago, sai do faturamento enquanto arquivado)`,
        execute: async (input, { access }) => summary(await archiveWork(access, input.businessId, input.workId)),
    }),
    defineTool("restore_work", {
        input: z.object({ businessId, workId }),
        summarize: (input) => `Restaurar o trabalho arquivado ${input.workId}`,
        execute: async (input, { access }) => summary(await restoreWork(access, input.businessId, input.workId)),
    }),
    defineTool("delete_work", {
        input: z.object({ businessId, workId }),
        summarize: (input) => `Excluir definitivamente o trabalho arquivado ${input.workId} (horas, notas e anexos; o pedido fica como registro)`,
        execute: async (input, { access }) => deleteWork(access, input.businessId, input.workId),
    }),
]

export const workTimeTools = [
    defineTool("list_time_entries", {
        input: z.object({ businessId, workId }),
        execute: async (input, { access }) => ({ items: await listTimeEntries(access, input.businessId, input.workId) }),
    }),
    defineTool("create_time_entry", {
        input: z.object({
            businessId,
            workId,
            source: z.enum(TIME_ENTRY_SOURCES).describe("orderItem = item do pedido; activity = atividade do negócio fora do pedido"),
            refId: z.string().trim().min(1).max(40).describe("itemId (de get_work) ou o id da atividade"),
            date: dateField.optional().describe("Dia trabalhado AAAA-MM-DD (padrão: hoje; não pode ser futuro)"),
            minutes: minutesField,
            description: z.string().trim().max(500).nullable().optional(),
        }),
        summarize: (input) => `Lançar ${Math.floor(input.minutes / 60)}:${String(input.minutes % 60).padStart(2, "0")} h no trabalho ${input.workId}${input.date ? ` em ${input.date.split("-").reverse().join("/")}` : " (hoje)"}`,
        execute: async ({ businessId: id, workId: work, date, ...input }, { access }) => createTimeEntry(access, id, work, { ...input, date: date ?? today(access) }),
    }),
    defineTool("update_time_entry", {
        input: z.object({
            businessId,
            workId,
            entryId: objectId.describe("Id do lançamento (de list_time_entries)"),
            source: z.enum(TIME_ENTRY_SOURCES).optional(),
            refId: z.string().trim().min(1).max(40).optional(),
            date: dateField.optional(),
            minutes: minutesField.optional(),
            description: z.string().trim().max(500).nullable().optional(),
        }),
        summarize: (input) => `Editar o lançamento de horas ${input.entryId}`,
        execute: async ({ businessId: id, workId: work, entryId, ...patch }, { access }) => {
            const entry = (await listTimeEntries(access, id, work)).find((item) => item.id === entryId)
            if (!entry) throw new OpexToolError("Lançamento não encontrado neste trabalho.")
            return updateTimeEntry(access, id, work, entryId, { ...patch, version: entry.version })
        },
    }),
    defineTool("delete_time_entry", {
        input: z.object({ businessId, workId, entryId: objectId }),
        summarize: (input) => `Excluir o lançamento de horas ${input.entryId}`,
        execute: async (input, { access }) => deleteTimeEntry(access, input.businessId, input.workId, input.entryId),
    }),
]

export const workNoteTools = [
    defineTool("add_work_note", {
        input: z.object({ businessId, workId, content: z.string().trim().min(1).max(4000) }),
        summarize: (input) => `Adicionar uma nota ao trabalho ${input.workId}`,
        execute: async (input, { access }) => ({ notes: (await addWorkNote(access, input.businessId, input.workId, { content: input.content })).notes.slice(0, 5) }),
    }),
    defineTool("update_work_note", {
        input: z.object({ businessId, workId, noteId: objectId.describe("Id da nota (de get_work)"), content: z.string().trim().min(1).max(4000) }),
        summarize: (input) => `Editar a nota ${input.noteId} do trabalho`,
        execute: async (input, { access }) => ({ notes: (await updateWorkNote(access, input.businessId, input.workId, input.noteId, { content: input.content })).notes.slice(0, 5) }),
    }),
    defineTool("delete_work_note", {
        input: z.object({ businessId, workId, noteId: objectId }),
        summarize: (input) => `Excluir a nota ${input.noteId} do trabalho`,
        execute: async (input, { access }) => ({ notes: (await deleteWorkNote(access, input.businessId, input.workId, input.noteId)).notes.length }),
    }),
    defineTool("add_work_attachment", {
        input: z.object({ businessId, workId, fileIds: z.array(z.string()).min(1).max(20).describe("Arquivos enviados no chat (list_chat_files)") }),
        summarize: (input) => `Anexar ${input.fileIds.length} arquivo(s) do chat ao trabalho ${input.workId}`,
        execute: async (input, context) => {
            const copied: string[] = []
            for (const fileId of input.fileIds) {
                const file = await loadSessionFile(context.sessionId, fileId)
                copied.push(await importChatFile(context.access, input.businessId, "work", { key: file.key, name: file.name, mediaType: file.mediaType, size: file.size }))
            }
            const work = await addWorkAttachments(context.access, input.businessId, input.workId, { fileIds: copied })
            return { attachments: work.attachments.map((file) => ({ id: file.id, name: file.name, size: file.size })) }
        },
    }),
    defineTool("convert_work_to_success", {
        input: z.object({
            businessId,
            workId,
            title: z.string().trim().min(1).max(160).optional().describe("Padrão: o título do pedido"),
            description: z.string().trim().max(4000).nullable().optional(),
            date: dateField.nullable().optional().describe("Padrão: a data do pagamento ou hoje"),
            result: z.string().trim().max(300).nullable().optional().describe("Resultado/métrica"),
        }),
        summarize: (input) => `Converter o trabalho ${input.workId} em sucesso${input.title ? ` "${input.title}"` : ""}`,
        execute: async (input, { access }) => {
            const work = await getWork(access, input.businessId, input.workId)
            if (work.successId) throw new OpexToolError("Este trabalho já foi convertido em sucesso.")
            const success = await createSuccess(access, input.businessId, {
                title: input.title ?? work.title.slice(0, 160),
                description: input.description ?? null,
                date: input.date ?? work.payment?.paidOn ?? today(access),
                result: input.result ?? null,
                clientId: work.clientId,
                workId: work.id,
            })
            return { id: success.id, title: success.title, date: success.date, clientId: success.clientId, workId: success.workId }
        },
    }),
]
