import { z } from "zod"
import { objectId } from "@/features/access/schemas"
import type { AccessContext } from "@/features/access/server/context"
import { importChatFile } from "@/features/businesses/server/files"
import { BLOCK_TYPES, blockSummary, COLUMN_RATIOS, findBlock, insertBlock, locateBlock, moveBlock, newBlock, portfolioBlockSchema, removeBlock, setColumnRatio, shiftBlock, updateBlock, type ColumnRatio, type ColumnsBlock, type PortfolioBlock } from "@/features/portfolio/blocks"
import { PORTFOLIO_ITEM_IMAGES_MAX } from "@/features/portfolio/constants"
import { archivePortfolioItem, createPortfolioItem, deletePortfolioItem, getPortfolioItem, listPortfolioItems, restorePortfolioItem, updatePortfolioItem } from "@/features/portfolio/server/items"
import { addPortfolioMedia, deletePortfolioMedia, listPortfolioMedia } from "@/features/portfolio/server/media"
import {
    applyPortfolioTemplate,
    discardPortfolioDraft,
    getPortfolio,
    listPortfolioPublications,
    publishPortfolioChanges,
    restorePortfolioPublication,
    savePortfolioDraft,
    setPortfolioPublished,
    updatePortfolioSettings,
    updatePortfolioSlug,
} from "@/features/portfolio/server/portfolio"
import { PORTFOLIO_TEMPLATES } from "@/features/portfolio/templates"
import type { PortfolioDto, PortfolioItemDto } from "@/features/portfolio/types"
import { loadSessionFile } from "../files"
import { defineTool, OpexToolError } from "./define"

/**
 * Portfólio público (M5): editor de blocos (o agente edita o RASCUNHO pelos mesmos serviços da tela e
 * publica as alterações), mídia, configurações e os itens avulsos. Imagens vêm de arquivos do chat,
 * copiadas para o negócio.
 */

const businessId = objectId.describe("Id do negócio (de list_businesses)")
const itemId = objectId.describe("Id do item avulso (de list_portfolio_items)")
const blockId = z.string().min(4).max(40).describe("Id do bloco (de get_portfolio_page)")
const chatFiles = z.array(z.string()).max(PORTFOLIO_ITEM_IMAGES_MAX).describe("Imagens enviadas no chat (list_chat_files): PNG, JPEG, WebP ou GIF")
const props = z.record(z.string(), z.unknown()).describe("Propriedades do bloco (ver a descrição da ferramenta)")

const slimPortfolio = (portfolio: PortfolioDto) => ({
    slug: portfolio.slug,
    url: portfolio.url,
    pagePublished: portfolio.published,
    indexable: portfolio.indexable,
    hasUnpublishedChanges: portfolio.hasChanges,
    publishedNumber: portfolio.live.number,
    problems: portfolio.problems,
    blocks: portfolio.draft.blocks,
    editable: portfolio.editable,
    canPublish: portfolio.canPublish,
})

const slimItem = (item: PortfolioItemDto) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    url: item.url,
    date: item.date,
    tags: item.tags,
    images: item.images.map((file) => ({ id: file.id, name: file.name, mediaType: file.mediaType })),
    status: item.status,
    archivedAt: item.archivedAt,
    purgeAt: item.purgeAt,
})

async function importImages(access: AccessContext, sessionId: string, id: string, fileIds: readonly string[], purpose: "portfolio" | "media" = "portfolio"): Promise<string[]> {
    const copied: string[] = []
    for (const fileId of fileIds) {
        const file = await loadSessionFile(sessionId, fileId)
        copied.push(await importChatFile(access, id, purpose, { key: file.key, name: file.name, mediaType: file.mediaType, size: file.size }))
    }
    return copied
}

/** Bloco validado (mensagem do primeiro problema para o modelo corrigir). */
function validBlock(block: unknown): PortfolioBlock {
    const parsed = portfolioBlockSchema.safeParse(block)
    if (!parsed.success) {
        const issue = parsed.error.issues[0]
        throw new OpexToolError(`Bloco inválido${issue?.path.length ? ` (${issue.path.join(".")})` : ""}: ${issue?.message ?? "confira as propriedades"}`)
    }
    return parsed.data
}

/** Aplica as propriedades (sem trocar id, tipo nem os blocos das colunas; `ratio` reorganiza as colunas). */
function patchBlock(current: PortfolioBlock, raw: Record<string, unknown>): PortfolioBlock {
    // id, tipo e os blocos das colunas não mudam por aqui.
    const { ratio, style, ...rest } = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "id" && key !== "type" && key !== "columns"))
    const nextStyle = style && typeof style === "object" ? { ...current.style, ...(style as object) } : current.style
    if (current.type === "columns") {
        const merged = validBlock({ ...current, ...rest, style: nextStyle }) as ColumnsBlock
        if (ratio === undefined) return merged
        if (!(COLUMN_RATIOS as readonly unknown[]).includes(ratio)) throw new OpexToolError(`Proporção inválida: use ${COLUMN_RATIOS.join(", ")}.`)
        return setColumnRatio(merged, ratio as ColumnRatio)
    }
    return validBlock({ ...current, ...rest, ...(ratio === undefined ? {} : { ratio }), style: nextStyle })
}

/** Altera o rascunho pelo serviço da tela (salvamento com a versão lida agora). */
async function editDraft(access: AccessContext, id: string, change: (blocks: PortfolioBlock[]) => PortfolioBlock[]) {
    const current = await getPortfolio(access, id)
    if (!current.editable) throw new OpexToolError("O portfólio está somente leitura (negócio arquivado, suporte ou sem portfolio.edit).")
    const next = change(current.draft.blocks)
    const saved = await savePortfolioDraft(access, id, { blocks: next, draftVersion: current.draft.version })
    return { blocks: next, hasUnpublishedChanges: saved.hasChanges, problems: saved.problems }
}

const publicationOf = (portfolio: PortfolioDto) => ({ ...slimPortfolio(portfolio), blocks: portfolio.draft.blocks.map((block) => ({ id: block.id, summary: blockSummary(block) })) })

export const portfolioTools = [
    defineTool("get_portfolio_page", {
        input: z.object({ businessId }),
        execute: async (input, { access }) => {
            const portfolio = await getPortfolio(access, input.businessId)
            const history = await listPortfolioPublications(access, input.businessId)
            return {
                ...slimPortfolio(portfolio),
                available: {
                    successes: portfolio.pool.successes.map((entry) => ({ id: entry.id, title: entry.title, clientName: entry.clientName })),
                    services: portfolio.pool.services.map((entry) => ({ id: entry.id, name: entry.name })),
                    documents: portfolio.pool.documents.map((entry) => ({ id: entry.id, name: entry.name })),
                    items: portfolio.pool.items.map((entry) => ({ id: entry.id, title: entry.title })),
                },
                media: portfolio.media.map((file) => ({ id: file.id, name: file.name })),
                history: history.map((entry) => ({ number: entry.number, publishedAt: entry.publishedAt, by: entry.publishedByName, current: entry.current })),
            }
        },
    }),
    defineTool("add_portfolio_block", {
        input: z.object({
            businessId,
            type: z.enum(BLOCK_TYPES),
            props: props.optional(),
            parentId: z.string().nullable().optional().describe("Bloco Colunas onde entrar (omita para a página)"),
            column: z.number().int().min(0).max(2).optional().describe("Coluna (0, 1 ou 2) dentro do bloco Colunas"),
            index: z.number().int().min(0).optional().describe("Posição (omita para o fim)"),
        }),
        summarize: (input) => `Adicionar um bloco ${input.type} ao rascunho do portfólio do negócio ${input.businessId}`,
        execute: async (input, { access }) => {
            const created = patchBlock(newBlock(input.type), (input.props ?? {}) as Record<string, unknown>)
            const result = await editDraft(access, input.businessId, (blocks) => {
                const parentId = input.parentId ?? null
                const index = input.index ?? (parentId ? (findBlock(blocks, parentId)?.type === "columns" ? Number.MAX_SAFE_INTEGER : 0) : blocks.length)
                const next = insertBlock(blocks, created, { parentId, column: input.column ?? 0, index })
                if (!findBlock(next, created.id)) throw new OpexToolError(parentId ? "Não foi possível colocar o bloco nessa coluna (só blocos simples, até 6 por coluna, e o parentId precisa ser um bloco Colunas)." : "Limite de blocos da página atingido.")
                return next
            })
            return { added: created, ...result }
        },
    }),
    defineTool("update_portfolio_block", {
        input: z.object({ businessId, blockId, props }),
        summarize: (input) => `Editar o bloco ${input.blockId} do rascunho do portfólio: ${Object.keys(input.props).join(", ") || "nada"}`,
        execute: async (input, { access }) => {
            return editDraft(access, input.businessId, (blocks) => {
                if (!findBlock(blocks, input.blockId)) throw new OpexToolError("Bloco não encontrado no rascunho.")
                return updateBlock(blocks, input.blockId, (current) => patchBlock(current, input.props as Record<string, unknown>))
            })
        },
    }),
    defineTool("move_portfolio_block", {
        input: z.object({
            businessId,
            blockId,
            delta: z.union([z.literal(-1), z.literal(1)]).optional().describe("-1 sobe, 1 desce (no mesmo lugar)"),
            parentId: z.string().nullable().optional(),
            column: z.number().int().min(0).max(2).optional(),
            index: z.number().int().min(0).optional(),
        }),
        summarize: (input) => `Mover o bloco ${input.blockId} no rascunho do portfólio`,
        execute: async (input, { access }) =>
            editDraft(access, input.businessId, (blocks) => {
                if (!locateBlock(blocks, input.blockId)) throw new OpexToolError("Bloco não encontrado no rascunho.")
                if (input.delta) return shiftBlock(blocks, input.blockId, input.delta)
                if (input.index === undefined) throw new OpexToolError("Informe delta ou index.")
                const next = moveBlock(blocks, input.blockId, { parentId: input.parentId ?? null, column: input.column ?? 0, index: input.index })
                if (JSON.stringify(next) === JSON.stringify(blocks)) throw new OpexToolError("O bloco não pode ir para esse lugar (colunas aceitam só blocos simples, até 6 por coluna).")
                return next
            }),
    }),
    defineTool("remove_portfolio_block", {
        input: z.object({ businessId, blockId }),
        summarize: (input) => `Remover o bloco ${input.blockId} do rascunho do portfólio (com os blocos de dentro, se for Colunas)`,
        execute: async (input, { access }) =>
            editDraft(access, input.businessId, (blocks) => {
                if (!findBlock(blocks, input.blockId)) throw new OpexToolError("Bloco não encontrado no rascunho.")
                return removeBlock(blocks, input.blockId)
            }),
    }),
    defineTool("apply_portfolio_template", {
        input: z.object({ businessId, template: z.enum(PORTFOLIO_TEMPLATES) }),
        summarize: (input) => `Substituir o rascunho do portfólio do negócio ${input.businessId} pelo modelo "${input.template}"`,
        execute: async (input, { access }) => {
            const current = await getPortfolio(access, input.businessId)
            return publicationOf(await applyPortfolioTemplate(access, input.businessId, { template: input.template, draftVersion: current.draft.version }))
        },
    }),
    defineTool("discard_portfolio_draft", {
        input: z.object({ businessId }),
        summarize: (input) => `Descartar as alterações não publicadas do portfólio do negócio ${input.businessId}`,
        execute: async (input, { access }) => {
            const current = await getPortfolio(access, input.businessId)
            return publicationOf(await discardPortfolioDraft(access, input.businessId, { draftVersion: current.draft.version }))
        },
    }),
    defineTool("restore_portfolio_publication", {
        input: z.object({ businessId, number: z.number().int().min(1).describe("Número da publicação (histórico de get_portfolio_page)") }),
        summarize: (input) => `Restaurar a publicação ${input.number} como rascunho do portfólio (substitui o rascunho atual)`,
        execute: async (input, { access }) => {
            const current = await getPortfolio(access, input.businessId)
            return publicationOf(await restorePortfolioPublication(access, input.businessId, input.number, { draftVersion: current.draft.version }))
        },
    }),
    defineTool("publish_portfolio_changes", {
        input: z.object({ businessId, publishPage: z.boolean().default(false).describe("Também ligar a página, se estiver desligada") }),
        summarize: (input) => `Publicar as alterações do portfólio do negócio ${input.businessId}${input.publishPage ? " e ligar a página (pública, sem login)" : ""}`,
        execute: async (input, { access }) => {
            const current = await getPortfolio(access, input.businessId)
            return publicationOf(await publishPortfolioChanges(access, input.businessId, { draftVersion: current.draft.version, version: current.version, publishPage: input.publishPage }))
        },
    }),
    defineTool("list_portfolio_media", {
        input: z.object({ businessId }),
        execute: async (input, { access }) => ({ items: (await listPortfolioMedia(access, input.businessId)).map((file) => ({ id: file.id, name: file.name, mediaType: file.mediaType, size: file.size })) }),
    }),
    defineTool("add_portfolio_media", {
        input: z.object({ businessId, fileIds: chatFiles.min(1) }),
        summarize: (input) => `Copiar ${input.fileIds.length} imagem(ns) do chat para a mídia do portfólio do negócio ${input.businessId}`,
        execute: async (input, context) => {
            const copied = await importImages(context.access, context.sessionId, input.businessId, input.fileIds, "media")
            return { items: (await addPortfolioMedia(context.access, input.businessId, { fileIds: copied })).map((file) => ({ id: file.id, name: file.name })) }
        },
    }),
    defineTool("delete_portfolio_media", {
        input: z.object({ businessId, fileId: objectId.describe("Id da imagem (de list_portfolio_media)") }),
        summarize: (input) => `Excluir definitivamente a imagem ${input.fileId} da mídia do portfólio`,
        execute: async (input, { access }) => ({ ok: true, ...(await deletePortfolioMedia(access, input.businessId, input.fileId)) }),
    }),
    defineTool("update_portfolio_settings", {
        input: z.object({ businessId, indexable: z.boolean().describe("Permitir a indexação pelo Google") }),
        summarize: (input) => `${input.indexable ? "Permitir" : "Impedir"} a indexação do portfólio do negócio ${input.businessId} pelos buscadores`,
        execute: async (input, { access }) => {
            const current = await getPortfolio(access, input.businessId)
            return publicationOf(await updatePortfolioSettings(access, input.businessId, { indexable: input.indexable, version: current.version }))
        },
    }),
    defineTool("publish_portfolio", {
        input: z.object({ businessId }),
        summarize: (input) => `Ligar a página do portfólio do negócio ${input.businessId} (fica pública, sem login)`,
        execute: async (input, { access }) => {
            const current = await getPortfolio(access, input.businessId)
            return publicationOf(await setPortfolioPublished(access, input.businessId, true, { version: current.version }))
        },
    }),
    defineTool("unpublish_portfolio", {
        input: z.object({ businessId }),
        summarize: (input) => `Despublicar o portfólio do negócio ${input.businessId} (a página pública passa a responder 404)`,
        execute: async (input, { access }) => {
            const current = await getPortfolio(access, input.businessId)
            return publicationOf(await setPortfolioPublished(access, input.businessId, false, { version: current.version }))
        },
    }),
    defineTool("update_portfolio_slug", {
        input: z.object({ businessId, slug: z.string().trim().max(60).describe("Novo endereço: minúsculas, números e hífen") }),
        summarize: (input) => `Trocar o endereço do portfólio do negócio ${input.businessId} para "${input.slug}" (o endereço antigo deixa de funcionar)`,
        execute: async (input, { access }) => {
            const current = await getPortfolio(access, input.businessId)
            return publicationOf(await updatePortfolioSlug(access, input.businessId, { slug: input.slug, version: current.version }))
        },
    }),
]

export const portfolioItemTools = [
    defineTool("list_portfolio_items", {
        input: z.object({ businessId, status: z.enum(["active", "archived", "all"]).default("active") }),
        execute: async (input, { access }) => {
            const list = await listPortfolioItems(access, input.businessId, input.status)
            return { editable: list.editable, items: list.items.map(slimItem), tags: [...new Set(list.items.flatMap((item) => item.tags))] }
        },
    }),
    defineTool("create_portfolio_item", {
        input: z.object({
            businessId,
            title: z.string().trim().max(160),
            description: z.string().trim().max(4000).nullable().optional(),
            url: z.string().trim().max(500).nullable().optional().describe("Link externo (https://…)"),
            date: z.string().nullable().optional().describe("AAAA-MM-DD"),
            tags: z.array(z.string()).max(10).optional().describe("Categorias/tags (prefira as já usadas no negócio)"),
            fileIds: chatFiles.optional(),
        }),
        summarize: (input) => `Criar o item avulso "${input.title}" no portfólio do negócio ${input.businessId}${input.fileIds?.length ? ` com ${input.fileIds.length} imagem(ns) do chat` : ""}`,
        execute: async ({ businessId: id, fileIds, ...input }, context) => {
            const imageIds = await importImages(context.access, context.sessionId, id, fileIds ?? [])
            return slimItem(await createPortfolioItem(context.access, id, { ...input, imageIds }))
        },
    }),
    defineTool("update_portfolio_item", {
        input: z.object({
            businessId,
            itemId,
            title: z.string().trim().max(160).optional(),
            description: z.string().trim().max(4000).nullable().optional(),
            url: z.string().trim().max(500).nullable().optional(),
            date: z.string().nullable().optional().describe("AAAA-MM-DD"),
            tags: z.array(z.string()).max(10).optional().describe("Lista COMPLETA das categorias/tags"),
            addFileIds: chatFiles.optional(),
            removeImageIds: z.array(z.string()).max(PORTFOLIO_ITEM_IMAGES_MAX).optional().describe("Ids de imagens atuais (de list_portfolio_items) a remover"),
        }),
        summarize: (input) => `Editar o item avulso ${input.itemId}: ${Object.keys(input).filter((key) => key !== "businessId" && key !== "itemId").join(", ") || "nada"}`,
        execute: async ({ businessId: id, itemId: target, addFileIds, removeImageIds, ...patch }, context) => {
            if (!Object.keys(patch).length && !addFileIds?.length && !removeImageIds?.length) throw new OpexToolError("Nada para alterar.")
            const current = await getPortfolioItem(context.access, id, target)
            const unknown = (removeImageIds ?? []).filter((image) => !current.images.some((file) => file.id === image))
            if (unknown.length) throw new OpexToolError(`Imagem(ns) não encontrada(s) neste item: ${unknown.join(", ")}`)
            const added = await importImages(context.access, context.sessionId, id, addFileIds ?? [])
            const images = addFileIds?.length || removeImageIds?.length ? [...current.images.map((file) => file.id).filter((image) => !removeImageIds?.includes(image)), ...added] : undefined
            return slimItem(await updatePortfolioItem(context.access, id, target, { ...patch, ...(images ? { imageIds: images } : {}), version: current.version }))
        },
    }),
    defineTool("archive_portfolio_item", {
        input: z.object({ businessId, itemId }),
        summarize: (input) => `Arquivar o item avulso ${input.itemId} (sai do portfólio; exclusão definitiva automática após o prazo da Plataforma)`,
        execute: async (input, { access }) => slimItem(await archivePortfolioItem(access, input.businessId, input.itemId)),
    }),
    defineTool("restore_portfolio_item", {
        input: z.object({ businessId, itemId }),
        summarize: (input) => `Restaurar o item avulso ${input.itemId}`,
        execute: async (input, { access }) => slimItem(await restorePortfolioItem(access, input.businessId, input.itemId)),
    }),
    defineTool("delete_portfolio_item", {
        input: z.object({ businessId, itemId }),
        summarize: (input) => `Excluir definitivamente o item avulso arquivado ${input.itemId} com as imagens (irreversível)`,
        execute: async (input, { access }) => ({ ok: true, ...(await deletePortfolioItem(access, input.businessId, input.itemId)) }),
    }),
]
