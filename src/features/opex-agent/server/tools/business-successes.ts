import { z } from "zod"
import { objectId } from "@/features/access/schemas"
import { importChatFile } from "@/features/businesses/server/files"
import { archiveSuccess, createSuccess, deleteSuccess, getSuccess, listSuccesses, restoreSuccess, updateSuccess } from "@/features/businesses/server/successes"
import type { AccessContext } from "@/features/access/server/context"
import type { SuccessDto } from "@/features/businesses/types"
import { loadSessionFile } from "../files"
import { defineTool, OpexToolError } from "./define"

/** Sucessos do negócio (M2). Anexos vêm de arquivos do chat, copiados para o negócio. */

const businessId = objectId.describe("Id do negócio (de list_businesses)")
const successId = objectId.describe("Id do sucesso (de list_successes)")
const chatFiles = z.array(z.string()).max(20).describe("Arquivos enviados no chat (list_chat_files)")

const slim = (success: SuccessDto) => ({
    id: success.id,
    title: success.title,
    description: success.description,
    date: success.date,
    result: success.result,
    attachments: success.attachments.map((file) => ({ id: file.id, name: file.name, mediaType: file.mediaType })),
    status: success.status,
    archivedAt: success.archivedAt,
    purgeAt: success.purgeAt,
})

async function importAll(access: AccessContext, sessionId: string, id: string, fileIds: readonly string[]): Promise<string[]> {
    const copied: string[] = []
    for (const fileId of fileIds) {
        const file = await loadSessionFile(sessionId, fileId)
        copied.push(await importChatFile(access, id, "success", { key: file.key, name: file.name, mediaType: file.mediaType, size: file.size }))
    }
    return copied
}

export const businessSuccessTools = [
    defineTool("list_successes", {
        input: z.object({ businessId, status: z.enum(["active", "archived", "all"]).default("active") }),
        execute: async (input, { access }) => {
            const list = await listSuccesses(access, input.businessId, input.status)
            return { editable: list.editable, items: list.items.map(slim) }
        },
    }),
    defineTool("get_success", {
        input: z.object({ businessId, successId }),
        execute: async (input, { access }) => {
            const success = await getSuccess(access, input.businessId, input.successId)
            return { ...slim(success), version: success.version }
        },
    }),
    defineTool("create_success", {
        input: z.object({
            businessId,
            title: z.string().trim().max(160),
            description: z.string().trim().max(4000).nullable().optional(),
            date: z.string().nullable().optional().describe("AAAA-MM-DD"),
            result: z.string().trim().max(300).nullable().optional().describe("Resultado/métrica (ex.: \"aumentou as vendas em 30%\")"),
            fileIds: chatFiles.optional(),
        }),
        summarize: (input) => `Criar o sucesso "${input.title}" no negócio ${input.businessId}${input.fileIds?.length ? ` com ${input.fileIds.length} anexo(s) do chat` : ""}`,
        execute: async ({ businessId: id, fileIds, ...input }, context) => {
            const attachmentIds = await importAll(context.access, context.sessionId, id, fileIds ?? [])
            return slim(await createSuccess(context.access, id, { ...input, attachmentIds }))
        },
    }),
    defineTool("update_success", {
        input: z.object({
            businessId,
            successId,
            title: z.string().trim().max(160).optional(),
            description: z.string().trim().max(4000).nullable().optional(),
            date: z.string().nullable().optional().describe("AAAA-MM-DD"),
            result: z.string().trim().max(300).nullable().optional(),
            addFileIds: chatFiles.optional(),
            removeAttachmentIds: z.array(z.string()).max(20).optional().describe("Ids de anexos atuais (de get_success) a remover"),
        }),
        summarize: (input) => `Editar o sucesso ${input.successId}: ${Object.keys(input).filter((key) => key !== "businessId" && key !== "successId").join(", ") || "nada"}`,
        execute: async ({ businessId: id, successId: itemId, addFileIds, removeAttachmentIds, ...patch }, context) => {
            if (!Object.keys(patch).length && !addFileIds?.length && !removeAttachmentIds?.length) throw new OpexToolError("Nada para alterar.")
            const current = await getSuccess(context.access, id, itemId)
            const unknown = (removeAttachmentIds ?? []).filter((attachment) => !current.attachments.some((file) => file.id === attachment))
            if (unknown.length) throw new OpexToolError(`Anexo(s) não encontrado(s) neste sucesso: ${unknown.join(", ")}`)
            const added = await importAll(context.access, context.sessionId, id, addFileIds ?? [])
            const attachments = addFileIds?.length || removeAttachmentIds?.length ? [...current.attachments.map((file) => file.id).filter((attachment) => !removeAttachmentIds?.includes(attachment)), ...added] : undefined
            return slim(await updateSuccess(context.access, id, itemId, { ...patch, ...(attachments ? { attachmentIds: attachments } : {}), version: current.version }))
        },
    }),
    defineTool("archive_success", {
        input: z.object({ businessId, successId }),
        summarize: (input) => `Arquivar o sucesso ${input.successId} (exclusão definitiva automática após o prazo da Plataforma)`,
        execute: async (input, { access }) => slim(await archiveSuccess(access, input.businessId, input.successId)),
    }),
    defineTool("restore_success", {
        input: z.object({ businessId, successId }),
        summarize: (input) => `Restaurar o sucesso ${input.successId}`,
        execute: async (input, { access }) => slim(await restoreSuccess(access, input.businessId, input.successId)),
    }),
    defineTool("delete_success", {
        input: z.object({ businessId, successId }),
        summarize: (input) => `Excluir definitivamente o sucesso arquivado ${input.successId} com os anexos (irreversível)`,
        execute: async (input, { access }) => ({ ok: true, ...(await deleteSuccess(access, input.businessId, input.successId)) }),
    }),
]
