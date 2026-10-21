import { z } from "zod"
import { objectId } from "@/features/access/schemas"
import { archiveClient, createClient, deleteClient, getClient, listClients, restoreClient, updateClient } from "@/features/orders/server/clients"
import type { ClientDto } from "@/features/orders/types"
import { defineTool, OpexToolError } from "./define"

/** Clientes (M3): do usuário (dono efetivo), servem a todos os negócios. */

const clientId = objectId.describe("Id do cliente (de list_clients)")

const slim = (client: ClientDto) => ({
    id: client.id,
    name: client.name,
    email: client.email,
    phone: client.phone,
    notes: client.notes,
    status: client.status,
    archivedAt: client.archivedAt,
    purgeAt: client.purgeAt,
    businessIds: client.businessIds,
    orderCount: client.orderCount,
    totals: client.totals,
})

const fields = {
    email: z.string().trim().max(200).nullable().optional().describe("E-mail (necessário para enviar o orçamento por e-mail)"),
    phone: z.string().trim().max(30).nullable().optional().describe("Telefone/WhatsApp"),
    notes: z.string().trim().max(4000).nullable().optional().describe("Observações privadas (nunca aparecem no link do cliente)"),
}

export const clientTools = [
    defineTool("list_clients", {
        input: z.object({
            q: z.string().trim().max(100).optional().describe("Busca por nome, e-mail ou telefone"),
            businessId: objectId.optional().describe("Só clientes com pedidos neste negócio"),
            status: z.enum(["active", "archived", "all"]).default("active"),
        }),
        execute: async (input, { access }) => {
            const list = await listClients(access, input)
            return { editable: list.editable, items: list.items.map(slim) }
        },
    }),
    defineTool("get_client", {
        input: z.object({ clientId }),
        execute: async (input, { access }) => {
            const client = await getClient(access, input.clientId)
            return {
                ...slim(client),
                version: client.version,
                editable: client.editable,
                orders: client.orders.map((order) => ({ id: order.id, businessId: order.businessId, businessName: order.businessName, code: order.code, title: order.displayTitle, status: order.status, currency: order.currency, totalCents: order.totalCents, dueDate: order.dueDate })),
            }
        },
    }),
    defineTool("create_client", {
        input: z.object({ name: z.string().trim().min(1).max(160).describe("Nome (pessoa ou empresa)"), ...fields }),
        summarize: (input) => `Criar o cliente "${input.name}"`,
        execute: async (input, { access }) => slim(await createClient(access, input)),
    }),
    defineTool("update_client", {
        input: z.object({ clientId, name: z.string().trim().min(1).max(160).optional(), ...fields }),
        summarize: (input) => `Editar o cliente ${input.clientId}: ${Object.keys(input).filter((key) => key !== "clientId").join(", ") || "nada"}`,
        execute: async ({ clientId: id, ...patch }, { access }) => {
            if (!Object.keys(patch).length) throw new OpexToolError("Nada para alterar.")
            const current = await getClient(access, id)
            return slim(await updateClient(access, id, { ...patch, version: current.version }))
        },
    }),
    defineTool("archive_client", {
        input: z.object({ clientId }),
        summarize: (input) => `Arquivar o cliente ${input.clientId} (exclusão definitiva automática após o prazo, exceto com pedidos)`,
        execute: async (input, { access }) => slim(await archiveClient(access, input.clientId)),
    }),
    defineTool("restore_client", {
        input: z.object({ clientId }),
        summarize: (input) => `Restaurar o cliente ${input.clientId}`,
        execute: async (input, { access }) => slim(await restoreClient(access, input.clientId)),
    }),
    defineTool("delete_client", {
        input: z.object({ clientId }),
        summarize: (input) => `Excluir definitivamente o cliente arquivado ${input.clientId} (sem pedidos; irreversível)`,
        execute: async (input, { access }) => ({ ok: true, ...(await deleteClient(access, input.clientId)) }),
    }),
]
