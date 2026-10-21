import { z } from "zod"
import { objectId } from "@/features/access/schemas"
import { formatAttachmentSize } from "@/lib/attachments"
import { archiveDocument, createDocument, deleteDocument, getDocument, listDocuments, restoreDocument, updateDocument } from "@/features/businesses/server/documents"
import { importChatFile } from "@/features/businesses/server/files"
import type { DocumentDto } from "@/features/businesses/types"
import { loadSessionFile } from "../files"
import { defineTool, OpexToolError } from "./define"

/** Documentos do negócio (M2). Criar usa um arquivo do chat, copiado para o negócio. */

const businessId = objectId.describe("Id do negócio (de list_businesses)")
const documentId = objectId.describe("Id do documento (de list_documents)")

const slim = (document: DocumentDto) => ({
    id: document.id,
    name: document.name,
    category: document.category,
    description: document.description,
    portfolio: document.portfolio,
    file: { name: document.file.name, mediaType: document.file.mediaType, size: formatAttachmentSize(document.file.size) },
    status: document.status,
    archivedAt: document.archivedAt,
    purgeAt: document.purgeAt,
})

export const businessDocumentTools = [
    defineTool("list_documents", {
        input: z.object({ businessId, status: z.enum(["active", "archived", "all"]).default("active") }),
        execute: async (input, { access }) => {
            const list = await listDocuments(access, input.businessId, input.status)
            return { editable: list.editable, items: list.items.map(slim), categories: [...new Set(list.items.map((item) => item.category).filter(Boolean))] }
        },
    }),
    defineTool("get_document", {
        input: z.object({ businessId, documentId }),
        execute: async (input, { access }) => {
            const document = await getDocument(access, input.businessId, input.documentId)
            return { ...slim(document), version: document.version }
        },
    }),
    defineTool("create_document", {
        input: z.object({
            businessId,
            fileId: z.string().describe("Arquivo enviado no chat (list_chat_files)"),
            name: z.string().trim().max(160).describe("Nome do documento"),
            category: z.string().trim().max(60).nullable().optional().describe("Prefira as categorias já usadas no negócio"),
            description: z.string().trim().max(4000).nullable().optional(),
            portfolio: z.boolean().optional().describe("Usar no portfólio (M5)"),
        }),
        summarize: (input) => `Criar o documento "${input.name}" no negócio ${input.businessId} com o arquivo ${input.fileId} do chat`,
        execute: async ({ businessId: id, fileId, ...input }, context) => {
            const file = await loadSessionFile(context.sessionId, fileId)
            const copied = await importChatFile(context.access, id, "document", { key: file.key, name: file.name, mediaType: file.mediaType, size: file.size })
            return slim(await createDocument(context.access, id, { ...input, portfolio: input.portfolio ?? false, fileId: copied }))
        },
    }),
    defineTool("update_document", {
        input: z.object({
            businessId,
            documentId,
            name: z.string().trim().max(160).optional(),
            category: z.string().trim().max(60).nullable().optional(),
            description: z.string().trim().max(4000).nullable().optional(),
            portfolio: z.boolean().optional(),
        }),
        summarize: (input) => `Editar o documento ${input.documentId}: ${Object.keys(input).filter((key) => key !== "businessId" && key !== "documentId").join(", ") || "nada"}`,
        execute: async ({ businessId: id, documentId: itemId, ...patch }, { access }) => {
            if (!Object.keys(patch).length) throw new OpexToolError("Nada para alterar.")
            const current = await getDocument(access, id, itemId)
            return slim(await updateDocument(access, id, itemId, { ...patch, version: current.version }))
        },
    }),
    defineTool("archive_document", {
        input: z.object({ businessId, documentId }),
        summarize: (input) => `Arquivar o documento ${input.documentId} (exclusão definitiva automática após o prazo da Plataforma)`,
        execute: async (input, { access }) => slim(await archiveDocument(access, input.businessId, input.documentId)),
    }),
    defineTool("restore_document", {
        input: z.object({ businessId, documentId }),
        summarize: (input) => `Restaurar o documento ${input.documentId}`,
        execute: async (input, { access }) => slim(await restoreDocument(access, input.businessId, input.documentId)),
    }),
    defineTool("delete_document", {
        input: z.object({ businessId, documentId }),
        summarize: (input) => `Excluir definitivamente o documento arquivado ${input.documentId} e o arquivo (irreversível)`,
        execute: async (input, { access }) => ({ ok: true, ...(await deleteDocument(access, input.businessId, input.documentId)) }),
    }),
]
