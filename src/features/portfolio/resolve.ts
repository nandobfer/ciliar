import type { BlockStyle, ButtonAction, ColumnRatio, PortfolioBlock, SectionBlock } from "./blocks"
import { CONFIDENTIAL_CLIENT_LABEL, type PortfolioSectionKey } from "./constants"

/**
 * Montagem dos blocos para exibição (M5) — módulo PURO. O mesmo resolvedor alimenta o editor (com
 * as rotas autenticadas dos arquivos e os itens indisponíveis sinalizados) e a página pública (URLs
 * assinadas; `publicBlocks` tira o que está vazio/indisponível). Recebe só o conteúdo ELEGÍVEL e
 * devolve só os campos da lista explícita: valores, disponibilidade, pedidos e trabalhos não existem aqui.
 */

export interface PoolFile {
    id: string
    name: string
    mediaType: string
    size: number
}

export interface ResolvedFile extends PoolFile {
    kind: "image" | "pdf" | "file"
    /** Exibição na página (imagens e PDF). */
    viewUrl: string | null
    downloadUrl: string
}

/** Conteúdo elegível do negócio, já na ordem padrão de cada fonte. */
export interface ContentPool {
    services: { id: string; name: string; description: string | null; createdAt: string }[]
    successes: { id: string; title: string; description: string | null; date: string | null; result: string | null; clientName: string | null; images: PoolFile[]; createdAt: string }[]
    documents: { id: string; name: string; description: string | null; file: PoolFile; createdAt: string }[]
    items: { id: string; title: string; description: string | null; url: string | null; date: string | null; tags: string[]; images: PoolFile[]; createdAt: string }[]
}

export const EMPTY_POOL: ContentPool = { services: [], successes: [], documents: [], items: [] }

export interface PortfolioContact {
    email: string | null
    phone: string | null
    whatsappUrl: string | null
}

export type ContentCard =
    | { source: "services"; id: string; name: string; description: string | null }
    | { source: "successes"; id: string; title: string; description: string | null; date: string | null; result: string | null; client: string | null; images: ResolvedFile[] }
    | { source: "documents"; id: string; name: string; description: string | null; file: ResolvedFile | null }
    | { source: "items"; id: string; title: string; description: string | null; url: string | null; date: string | null; tags: string[]; images: ResolvedFile[] }

interface ResolvedBase {
    id: string
    style: BlockStyle
}

export type ResolvedSimpleBlock = ResolvedBase &
    (
        | { type: "heading"; text: string; level: 2 | 3 }
        | { type: "text"; markdown: string }
        | { type: "image"; file: ResolvedFile | null; alt: string; caption: string; width: "contained" | "full" }
        | { type: "gallery"; files: ResolvedFile[]; layout: "grid" | "carousel"; columns: 2 | 3 | 4 }
        | { type: "button"; label: string; action: ButtonAction; href: string | null; variant: "solid" | "outline" }
        | { type: "testimonial"; quote: string; author: string; role: string; photo: ResolvedFile | null }
        | { type: "separator"; variant: "line" | "space"; size: "sm" | "md" | "lg" }
        | { type: "featured"; source: PortfolioSectionKey; card: ContentCard | null }
    )

export type ResolvedBlock =
    | ResolvedSimpleBlock
    | (ResolvedBase & { type: "columns"; ratio: ColumnRatio; columns: ResolvedSimpleBlock[][] })
    | (ResolvedBase & { type: "section"; source: PortfolioSectionKey; title: string; layout: "grid" | "list" | "carousel"; columns: 2 | 3; cards: ContentCard[]; missing: number })

export type FileResolver = (file: PoolFile) => ResolvedFile | null

/** Imagem rasterizada e PDF aparecem na página; o resto só baixa. */
export function publicFileKind(mediaType: string): ResolvedFile["kind"] {
    if (mediaType === "application/pdf") return "pdf"
    if (mediaType.startsWith("image/") && mediaType !== "image/svg+xml") return "image"
    return "file"
}

const sortKey = (entry: { date?: string | null; createdAt: string }) => entry.date || entry.createdAt.slice(0, 10)
const nameOf = (entry: { name?: string; title?: string }) => entry.name ?? entry.title ?? ""

type PoolEntry = ContentPool[PortfolioSectionKey][number]

/** Itens da seção (em ordem, com o limite) e quantos escolhidos não estão disponíveis. */
export function sectionEntries(block: Pick<SectionBlock, "source" | "mode" | "picks" | "sort" | "limit" | "showClient">, pool: ContentPool): { entries: { entry: PoolEntry; showClient: boolean }[]; missing: number } {
    const list = pool[block.source] as PoolEntry[]
    const byId = new Map(list.map((entry) => [entry.id, entry]))
    let missing = 0
    let entries: { entry: PoolEntry; showClient: boolean }[]
    if (block.mode === "all") entries = list.map((entry) => ({ entry, showClient: block.showClient }))
    else {
        entries = block.picks.flatMap((pick) => {
            const entry = byId.get(pick.id)
            if (!entry) missing += 1
            return entry ? [{ entry, showClient: pick.showClient }] : []
        })
    }
    if (block.sort === "newest") entries = [...entries].sort((a, b) => sortKey(b.entry).localeCompare(sortKey(a.entry)))
    if (block.sort === "oldest") entries = [...entries].sort((a, b) => sortKey(a.entry).localeCompare(sortKey(b.entry)))
    if (block.sort === "name") entries = [...entries].sort((a, b) => nameOf(a.entry).localeCompare(nameOf(b.entry), "pt-BR"))
    return { entries: block.limit ? entries.slice(0, block.limit) : entries, missing }
}

function cardOf(source: PortfolioSectionKey, entry: PoolEntry, showClient: boolean, fileOf: FileResolver): ContentCard {
    const files = (refs: PoolFile[]) => refs.map(fileOf).filter((file): file is ResolvedFile => Boolean(file))
    if (source === "services") {
        const service = entry as ContentPool["services"][number]
        return { source, id: service.id, name: service.name, description: service.description }
    }
    if (source === "successes") {
        const success = entry as ContentPool["successes"][number]
        return { source, id: success.id, title: success.title, description: success.description, date: success.date, result: success.result, client: success.clientName ? (showClient ? success.clientName : CONFIDENTIAL_CLIENT_LABEL) : null, images: files(success.images.filter((file) => publicFileKind(file.mediaType) === "image")) }
    }
    if (source === "documents") {
        const document = entry as ContentPool["documents"][number]
        return { source, id: document.id, name: document.name, description: document.description, file: fileOf(document.file) }
    }
    const item = entry as ContentPool["items"][number]
    return { source, id: item.id, title: item.title, description: item.description, url: item.url, date: item.date, tags: item.tags, images: files(item.images) }
}

/** Destino do botão a partir do contato do negócio (`null` = indisponível). */
export function buttonHref(action: ButtonAction, url: string, contact: PortfolioContact): string | null {
    if (action === "whatsapp") return contact.whatsappUrl
    if (action === "email") return contact.email ? `mailto:${contact.email}` : null
    if (action === "phone") return contact.phone ? `tel:${contact.phone.replace(/[^\d+]/g, "")}` : null
    try {
        const parsed = new URL(url.trim())
        return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null
    } catch {
        return null
    }
}

export function resolveBlocks(blocks: readonly PortfolioBlock[], pool: ContentPool, media: ReadonlyMap<string, PoolFile>, fileOf: FileResolver, contact: PortfolioContact): ResolvedBlock[] {
    const mediaFile = (id: string | null) => {
        const file = id ? media.get(id) : undefined
        return file ? fileOf(file) : null
    }
    const simple = (block: PortfolioBlock): ResolvedSimpleBlock | null => {
        const base = { id: block.id, style: block.style }
        switch (block.type) {
            case "heading":
                return { ...base, type: "heading", text: block.text, level: block.level }
            case "text":
                return { ...base, type: "text", markdown: block.markdown }
            case "image":
                return { ...base, type: "image", file: mediaFile(block.mediaId), alt: block.alt, caption: block.caption, width: block.width }
            case "gallery":
                return { ...base, type: "gallery", files: block.mediaIds.map(mediaFile).filter((file): file is ResolvedFile => Boolean(file)), layout: block.layout, columns: block.columns }
            case "button":
                return { ...base, type: "button", label: block.label, action: block.action, href: buttonHref(block.action, block.url, contact), variant: block.variant }
            case "testimonial":
                return { ...base, type: "testimonial", quote: block.quote, author: block.author, role: block.role, photo: mediaFile(block.photoId) }
            case "separator":
                return { ...base, type: "separator", variant: block.variant, size: block.size }
            case "featured": {
                const entry = (pool[block.source] as PoolEntry[]).find((candidate) => candidate.id === block.refId)
                return { ...base, type: "featured", source: block.source, card: entry ? cardOf(block.source, entry, block.showClient, fileOf) : null }
            }
            default:
                return null
        }
    }
    return blocks.flatMap((block): ResolvedBlock[] => {
        if (block.type === "columns") return [{ id: block.id, style: block.style, type: "columns", ratio: block.ratio, columns: block.columns.map((children) => children.map(simple).filter((child): child is ResolvedSimpleBlock => Boolean(child))) }]
        if (block.type === "section") {
            const { entries, missing } = sectionEntries(block, pool)
            return [{ id: block.id, style: block.style, type: "section", source: block.source, title: block.title, layout: block.layout, columns: block.columns, cards: entries.map(({ entry, showClient }) => cardOf(block.source, entry, showClient, fileOf)), missing }]
        }
        const resolved = simple(block)
        return resolved ? [resolved] : []
    })
}

/** Arquivos que a página vai mostrar (para assinar só esses). */
export function referencedFiles(blocks: readonly ResolvedBlock[]): ResolvedFile[] {
    const out = new Map<string, ResolvedFile>()
    const add = (file: ResolvedFile | null | undefined) => file && out.set(file.id, file)
    const card = (value: ContentCard | null) => {
        if (!value) return
        if (value.source === "documents") add(value.file)
        if (value.source === "successes" || value.source === "items") value.images.forEach(add)
    }
    const visit = (block: ResolvedBlock) => {
        if (block.type === "image") add(block.file)
        if (block.type === "gallery") block.files.forEach(add)
        if (block.type === "testimonial") add(block.photo)
        if (block.type === "featured") card(block.card)
        if (block.type === "section") block.cards.forEach(card)
        if (block.type === "columns") block.columns.flat().forEach(visit)
    }
    blocks.forEach(visit)
    return [...out.values()]
}

/** Documento sem arquivo (falha do storage) não aparece. */
const cardVisible = (card: ContentCard) => card.source !== "documents" || Boolean(card.file)

/** O que o visitante vê: sem blocos vazios, indisponíveis ou incompletos. */
export function publicBlocks(blocks: readonly ResolvedBlock[]): ResolvedBlock[] {
    const keepSimple = (block: ResolvedSimpleBlock): boolean => {
        if (block.type === "heading") return Boolean(block.text.trim())
        if (block.type === "text") return Boolean(block.markdown.trim())
        if (block.type === "image") return Boolean(block.file && block.file.kind === "image")
        if (block.type === "gallery") return block.files.some((file) => file.kind === "image")
        if (block.type === "button") return Boolean(block.href && block.label.trim())
        if (block.type === "testimonial") return Boolean(block.quote.trim())
        if (block.type === "featured") return Boolean(block.card && cardVisible(block.card))
        return true
    }
    return blocks.flatMap((block): ResolvedBlock[] => {
        if (block.type === "section") {
            const cards = block.cards.filter(cardVisible)
            return cards.length ? [{ ...block, cards, missing: 0 }] : []
        }
        if (block.type === "columns") {
            const columns = block.columns.map((children) => children.filter(keepSimple))
            return columns.some((children) => children.length) ? [{ ...block, columns }] : []
        }
        return keepSimple(block) ? [block] : []
    })
}
