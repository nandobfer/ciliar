import { z } from "zod"
import { objectId } from "@/features/access/schemas"
import type { AccessContext } from "@/features/access/server/context"
import { importChatFile } from "@/features/businesses/server/files"
import { acceptOrder, cancelOrder, createOrder, getOrder, listBusinessOrders, listOrders, regenerateOrderTitle, rejectOrder, reopenOrder, revokeOrderLink, sendOrder, updateOrder } from "@/features/orders/server/orders"
import { ORDER_STATUSES } from "@/features/orders/constants"
import type { OrderDto, OrderSummaryDto } from "@/features/orders/types"
import { loadSessionFile } from "../files"
import { defineTool, OpexToolError } from "./define"

/**
 * Pedidos (M3). Anexos vêm de arquivos do chat, copiados para o negócio. O token do link nunca vai
 * ao modelo: `send_order` só devolve a URL com `copyLink: true` (o usuário pediu para copiar).
 */

const businessId = objectId.describe("Id do negócio (de list_businesses)")
const orderId = objectId.describe("Id do pedido (de list_orders)")
const chatFiles = z.array(z.string()).max(20).describe("Arquivos enviados no chat (list_chat_files)")
const items = z
    .array(
        z.object({
            itemId: z.string().max(40).optional().describe("Id de um item atual (de get_order): mantém a atividade e o valor/hora congelado"),
            activityId: objectId.optional().describe("Atividade ATIVA do negócio para um item novo (o valor/hora é copiado agora)"),
            minutes: z.number().int().min(0).describe("Horas estimadas em minutos (ex.: 90 = 1h30)"),
        }),
    )
    .max(50)
const newClient = z.object({ name: z.string().trim().min(1).max(160), email: z.string().trim().max(200).nullable().optional(), phone: z.string().trim().max(30).nullable().optional() })

const summary = (order: OrderSummaryDto) => ({
    id: order.id,
    businessId: order.businessId,
    businessName: order.businessName,
    code: order.code,
    title: order.displayTitle,
    clientId: order.clientId,
    clientName: order.clientName,
    status: order.status,
    currency: order.currency,
    totalCents: order.totalCents,
    totalMinutes: order.totalMinutes,
    dueDate: order.dueDate,
    link: order.link,
    workId: order.workId,
})

const detail = (order: OrderDto) => ({
    ...summary(order),
    description: order.description,
    aiTitle: { title: order.title, summary: order.summary, titleManual: order.titleManual, summaryManual: order.summaryManual, status: order.aiStatus, error: order.aiError },
    items: order.items.map((item) => ({ itemId: item.id, activityId: item.activityId, activityName: item.activityName, minutes: item.minutes, hourlyRateCents: item.hourlyRateCents, subtotalCents: item.subtotalCents })),
    suggestedTotalCents: order.suggestedTotalCents,
    totalManual: order.totalManual,
    attachments: order.attachments.map((file) => ({ id: file.id, name: file.name, mediaType: file.mediaType, clientVisible: file.clientVisible })),
    decision: order.decision,
    decisions: order.decisions,
    versions: order.versions.map((version) => ({ number: version.number, reason: version.reason, published: version.published, actorName: version.actorName, createdAt: version.createdAt, changes: version.changes, snapshot: version.snapshot })),
    editable: order.editable,
    actions: order.actions,
    version: order.version,
})

async function importAll(access: AccessContext, sessionId: string, id: string, fileIds: readonly string[]): Promise<string[]> {
    const copied: string[] = []
    for (const fileId of fileIds) {
        const file = await loadSessionFile(sessionId, fileId)
        copied.push(await importChatFile(access, id, "order", { key: file.key, name: file.name, mediaType: file.mediaType, size: file.size }))
    }
    return copied
}

const toItems = (list: z.infer<typeof items>) => list.map((item) => (item.itemId ? { id: item.itemId, minutes: item.minutes } : { activityId: item.activityId, minutes: item.minutes }))

export const orderTools = [
    defineTool("list_orders", {
        input: z.object({ businessId: businessId.optional(), clientId: objectId.optional(), status: z.enum(ORDER_STATUSES).optional() }),
        execute: async (input, { access }) => {
            const list = input.businessId ? await listBusinessOrders(access, input.businessId, { status: input.status, clientId: input.clientId }) : await listOrders(access, input)
            return { editable: list.editable, items: list.items.map(summary) }
        },
    }),
    defineTool("get_order", {
        input: z.object({ businessId, orderId }),
        execute: async (input, { access }) => detail(await getOrder(access, input.businessId, input.orderId)),
    }),
    defineTool("create_order", {
        input: z.object({
            businessId,
            clientId: objectId.optional().describe("Cliente existente (de list_clients)"),
            newClient: newClient.optional().describe("Cadastra o cliente junto (use quando ele ainda não existe)"),
            description: z.string().trim().min(1).max(8000).describe("Necessidade do cliente (texto livre)"),
            title: z.string().trim().max(120).optional().describe("Título manual (sem ele, a IA gera)"),
            summary: z.string().trim().max(400).optional().describe("Resumo manual (sem ele, a IA gera)"),
            items: items.default([]),
            totalOverrideCents: z.number().int().min(0).nullable().optional().describe("Valor total ajustado (unidades mínimas); sem ele, Σ horas × valor/hora"),
            dueDate: z.string().nullable().optional().describe("Prazo de entrega AAAA-MM-DD"),
            fileIds: chatFiles.optional(),
            filesVisibleToClient: z.boolean().default(true),
        }),
        summarize: (input) => `Criar um pedido no negócio ${input.businessId} para ${input.newClient ? `o novo cliente "${input.newClient.name}"` : `o cliente ${input.clientId ?? "?"}`} com ${input.items.length} item(ns)${input.fileIds?.length ? ` e ${input.fileIds.length} anexo(s) do chat` : ""}`,
        execute: async ({ businessId: id, fileIds, filesVisibleToClient, items: list, ...input }, context) => {
            const copied = await importAll(context.access, context.sessionId, id, fileIds ?? [])
            return detail(await createOrder(context.access, id, { ...input, items: toItems(list), attachments: copied.map((fileId) => ({ fileId, clientVisible: filesVisibleToClient })) }))
        },
    }),
    defineTool("update_order", {
        input: z.object({
            businessId,
            orderId,
            clientId: objectId.optional(),
            newClient: newClient.optional(),
            description: z.string().trim().min(1).max(8000).optional(),
            title: z.string().trim().max(120).nullable().optional().describe("null devolve o título à IA"),
            summary: z.string().trim().max(400).nullable().optional().describe("null devolve o resumo à IA"),
            items: items.optional().describe("Lista COMPLETA dos itens"),
            totalOverrideCents: z.number().int().min(0).nullable().optional().describe("null volta ao valor calculado"),
            dueDate: z.string().nullable().optional(),
            addFileIds: chatFiles.optional(),
            addedFilesVisibleToClient: z.boolean().default(true),
            removeAttachmentIds: z.array(z.string()).max(20).optional().describe("Ids de anexos atuais (de get_order) a remover"),
            attachmentVisibility: z.array(z.object({ id: z.string(), clientVisible: z.boolean() })).max(20).optional().describe("Muda o \"visível ao cliente\" de anexos atuais"),
        }),
        summarize: (input) => `Editar o pedido ${input.orderId}: ${Object.keys(input).filter((key) => !["businessId", "orderId", "addedFilesVisibleToClient"].includes(key)).join(", ") || "nada"}`,
        execute: async ({ businessId: id, orderId: itemId, addFileIds, addedFilesVisibleToClient, removeAttachmentIds, attachmentVisibility, items: list, ...patch }, context) => {
            const current = await getOrder(context.access, id, itemId)
            const unknown = [...(removeAttachmentIds ?? []), ...(attachmentVisibility ?? []).map((entry) => entry.id)].filter((attachment) => !current.attachments.some((file) => file.id === attachment))
            if (unknown.length) throw new OpexToolError(`Anexo(s) não encontrado(s) neste pedido: ${unknown.join(", ")}`)
            const added = await importAll(context.access, context.sessionId, id, addFileIds ?? [])
            const touchesFiles = added.length || removeAttachmentIds?.length || attachmentVisibility?.length
            const attachments = touchesFiles
                ? [
                      ...current.attachments.filter((file) => !removeAttachmentIds?.includes(file.id)).map((file) => ({ fileId: file.id, clientVisible: attachmentVisibility?.find((entry) => entry.id === file.id)?.clientVisible ?? file.clientVisible })),
                      ...added.map((fileId) => ({ fileId, clientVisible: addedFilesVisibleToClient })),
                  ]
                : undefined
            const body = { ...patch, ...(list ? { items: toItems(list) } : {}), ...(attachments ? { attachments } : {}) }
            if (!Object.keys(body).length) throw new OpexToolError("Nada para alterar.")
            return detail(await updateOrder(context.access, id, itemId, { ...body, version: current.version }))
        },
    }),
    defineTool("regenerate_order_title", {
        input: z.object({ businessId, orderId }),
        summarize: (input) => `Gerar de novo o título/resumo por IA do pedido ${input.orderId}`,
        execute: async (input, { access }) => summary(await regenerateOrderTitle(access, input.businessId, input.orderId)),
    }),
    defineTool("send_order", {
        input: z.object({
            businessId,
            orderId,
            validUntil: z.string().optional().describe("Válido até AAAA-MM-DD (padrão: hoje + validade do negócio)"),
            email: z.boolean().default(false).describe("Enviar o e-mail ao cliente (exige e-mail e SMTP)"),
            copyLink: z.boolean().default(false).describe("Devolver a URL do link (só quando o usuário pediu para copiar)"),
        }),
        summarize: (input) => `Enviar o pedido ${input.orderId} (gera/renova o link do cliente${input.validUntil ? ` válido até ${input.validUntil.split("-").reverse().join("/")}` : ""}${input.email ? " e envia o e-mail" : ""})`,
        execute: async ({ businessId: id, orderId: itemId, copyLink, ...input }, { access }) => {
            const current = await getOrder(access, id, itemId)
            const result = await sendOrder(access, id, itemId, { ...input, version: current.version })
            return { ...summary(result.order), email: result.email, ...(copyLink ? { url: result.url } : {}) }
        },
    }),
    defineTool("revoke_order_link", {
        input: z.object({ businessId, orderId }),
        summarize: (input) => `Revogar o link do pedido ${input.orderId} (o cliente perde o acesso; volta a Rascunho)`,
        execute: async (input, { access }) => summary(await revokeOrderLink(access, input.businessId, input.orderId, { version: (await getOrder(access, input.businessId, input.orderId)).version })),
    }),
    defineTool("accept_order", {
        input: z.object({ businessId, orderId }),
        summarize: (input) => `Registrar o aceite do pedido ${input.orderId} (cria o trabalho em Abertura)`,
        execute: async (input, { access }) => summary(await acceptOrder(access, input.businessId, input.orderId, { version: (await getOrder(access, input.businessId, input.orderId)).version })),
    }),
    defineTool("reject_order", {
        input: z.object({ businessId, orderId, reason: z.string().trim().max(2000).nullable().optional() }),
        summarize: (input) => `Registrar a recusa do pedido ${input.orderId}${input.reason ? `: ${input.reason}` : ""}`,
        execute: async (input, { access }) => summary(await rejectOrder(access, input.businessId, input.orderId, { reason: input.reason ?? null, version: (await getOrder(access, input.businessId, input.orderId)).version })),
    }),
    defineTool("reopen_order", {
        input: z.object({ businessId, orderId }),
        summarize: (input) => `Reabrir o pedido recusado ${input.orderId} (volta a Rascunho)`,
        execute: async (input, { access }) => summary(await reopenOrder(access, input.businessId, input.orderId, { version: (await getOrder(access, input.businessId, input.orderId)).version })),
    }),
    defineTool("cancel_order", {
        input: z.object({ businessId, orderId }),
        summarize: (input) => `Cancelar o pedido ${input.orderId} (revoga o link; estado final)`,
        execute: async (input, { access }) => summary(await cancelOrder(access, input.businessId, input.orderId, { version: (await getOrder(access, input.businessId, input.orderId)).version })),
    }),
]
