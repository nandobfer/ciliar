import { z } from "zod"
import { PORTFOLIO_SECTION_KEYS, PORTFOLIO_SECTION_LABELS, type PortfolioSectionKey } from "./constants"

/**
 * Blocos do editor do portfólio (M5) — módulo PURO (servidor e navegador). A página é uma lista de
 * blocos empilhados; o bloco Colunas tem 2 ou 3 colunas com blocos simples dentro (um nível só). Os
 * blocos de conteúdo (Seção e Item em destaque) guardam só referências: o conteúdo é lido ao vivo.
 * O rascunho aceita blocos incompletos; `publishProblems` lista o que impede publicar.
 */

export const PORTFOLIO_BLOCKS_MAX = 80
export const PORTFOLIO_COLUMN_BLOCKS_MAX = 6
export const PORTFOLIO_GALLERY_MAX = 24
export const PORTFOLIO_SECTION_PICKS_MAX = 100
export const PORTFOLIO_HEADING_MAX = 200
export const PORTFOLIO_TEXT_MAX = 5000
export const PORTFOLIO_PUBLICATIONS_KEEP = 20

export const BLOCK_BACKGROUNDS = ["none", "subtle", "primary"] as const
export const BLOCK_SPACINGS = ["sm", "md", "lg"] as const
export const BLOCK_ALIGNS = ["left", "center"] as const
export const COLUMN_RATIOS = ["50-50", "33-67", "67-33", "33-33-33"] as const
export type ColumnRatio = (typeof COLUMN_RATIOS)[number]
export const COLUMN_COUNT: Record<ColumnRatio, number> = { "50-50": 2, "33-67": 2, "67-33": 2, "33-33-33": 3 }
export const BUTTON_ACTIONS = ["whatsapp", "email", "phone", "link"] as const
export type ButtonAction = (typeof BUTTON_ACTIONS)[number]
export const SECTION_SORTS = ["manual", "newest", "oldest", "name"] as const
export const SECTION_LAYOUTS = ["grid", "list", "carousel"] as const

export const BLOCK_TYPES = ["heading", "text", "image", "gallery", "button", "testimonial", "separator", "columns", "section", "featured"] as const
export type PortfolioBlockType = (typeof BLOCK_TYPES)[number]
/** Blocos aceitos dentro das colunas (sem colunas aninhadas nem seções). */
export const SIMPLE_BLOCK_TYPES = ["heading", "text", "image", "gallery", "button", "testimonial", "separator", "featured"] as const
export type SimpleBlockType = (typeof SIMPLE_BLOCK_TYPES)[number]
export const isSimpleType = (type: string): type is SimpleBlockType => (SIMPLE_BLOCK_TYPES as readonly string[]).includes(type)

export const BLOCK_LABELS: Record<PortfolioBlockType, string> = {
    heading: "Título",
    text: "Texto",
    image: "Imagem",
    gallery: "Galeria",
    button: "Botão",
    testimonial: "Depoimento",
    separator: "Separador",
    columns: "Colunas",
    section: "Seção",
    featured: "Item em destaque",
}
export const BLOCK_DESCRIPTIONS: Record<PortfolioBlockType, string> = {
    heading: "Título de uma parte da página",
    text: "Parágrafos com negrito, itálico, links e listas",
    image: "Uma imagem da mídia, com legenda",
    gallery: "Várias imagens em grade ou carrossel",
    button: "Chamada para WhatsApp, e-mail, telefone ou link",
    testimonial: "Citação de um cliente",
    separator: "Linha ou espaço entre blocos",
    columns: "Blocos lado a lado (2 ou 3 colunas)",
    section: "Lista de sucessos, serviços, documentos ou itens avulsos",
    featured: "Um sucesso, documento, serviço ou item avulso em destaque",
}
/** Rótulo de cada fonte de conteúdo no editor (os "Projetos" públicos são os itens avulsos). */
export const SOURCE_LABELS: Record<PortfolioSectionKey, { one: string; many: string }> = {
    services: { one: "Serviço", many: "Serviços" },
    successes: { one: "Sucesso", many: "Sucessos" },
    documents: { one: "Documento", many: "Documentos" },
    items: { one: "Item avulso", many: "Itens avulsos" },
}

// ── Esquemas ───────────────────────────────────────────────────────────────

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Id inválido")
export const blockIdSchema = z.string().regex(/^[A-Za-z0-9_-]{4,40}$/, "Id de bloco inválido")
const text = (max: number) => z.string().max(max, `Até ${max.toLocaleString("pt-BR")} caracteres`)

export const blockStyleSchema = z.strictObject({
    background: z.enum(BLOCK_BACKGROUNDS).default("none"),
    spacing: z.enum(BLOCK_SPACINGS).default("md"),
    align: z.enum(BLOCK_ALIGNS).default("left"),
})
export type BlockStyle = z.infer<typeof blockStyleSchema>
const style = blockStyleSchema.default({ background: "none", spacing: "md", align: "left" })
const base = { id: blockIdSchema, style }

const headingSchema = z.strictObject({ ...base, type: z.literal("heading"), text: text(PORTFOLIO_HEADING_MAX), level: z.union([z.literal(2), z.literal(3)]).default(2) })
const textSchema = z.strictObject({ ...base, type: z.literal("text"), markdown: text(PORTFOLIO_TEXT_MAX) })
const imageSchema = z.strictObject({ ...base, type: z.literal("image"), mediaId: objectId.nullable(), alt: text(200), caption: text(300), width: z.enum(["contained", "full"]).default("contained") })
const gallerySchema = z.strictObject({
    ...base,
    type: z.literal("gallery"),
    mediaIds: z.array(objectId).max(PORTFOLIO_GALLERY_MAX, `Até ${PORTFOLIO_GALLERY_MAX} imagens na galeria`),
    layout: z.enum(["grid", "carousel"]).default("grid"),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
})
const buttonSchema = z.strictObject({ ...base, type: z.literal("button"), label: text(60), action: z.enum(BUTTON_ACTIONS), url: text(500), variant: z.enum(["solid", "outline"]).default("solid") })
const testimonialSchema = z.strictObject({ ...base, type: z.literal("testimonial"), quote: text(1000), author: text(120), role: text(120), photoId: objectId.nullable() })
const separatorSchema = z.strictObject({ ...base, type: z.literal("separator"), variant: z.enum(["line", "space"]).default("line"), size: z.enum(BLOCK_SPACINGS).default("md") })
const featuredSchema = z.strictObject({ ...base, type: z.literal("featured"), source: z.enum(PORTFOLIO_SECTION_KEYS), refId: objectId, showClient: z.boolean().default(false) })
const sectionSchema = z.strictObject({
    ...base,
    type: z.literal("section"),
    source: z.enum(PORTFOLIO_SECTION_KEYS),
    title: text(120),
    /** `picked` = escolhidos um a um; `all` = todos os disponíveis (os novos entram sozinhos). */
    mode: z.enum(["picked", "all"]).default("picked"),
    picks: z
        .array(z.strictObject({ id: objectId, showClient: z.boolean().default(false) }))
        .max(PORTFOLIO_SECTION_PICKS_MAX, `Até ${PORTFOLIO_SECTION_PICKS_MAX} itens escolhidos`)
        .refine((picks) => new Set(picks.map((pick) => pick.id)).size === picks.length, "Item repetido na seção"),
    sort: z.enum(SECTION_SORTS).default("manual"),
    limit: z.number().int().min(1).max(PORTFOLIO_SECTION_PICKS_MAX).nullable().default(null),
    layout: z.enum(SECTION_LAYOUTS).default("grid"),
    columns: z.union([z.literal(2), z.literal(3)]).default(2),
    /** No modo `all`: mostrar o nome do cliente dos sucessos (senão "Cliente confidencial"). */
    showClient: z.boolean().default(false),
})

export const simpleBlockSchema = z.discriminatedUnion("type", [headingSchema, textSchema, imageSchema, gallerySchema, buttonSchema, testimonialSchema, separatorSchema, featuredSchema])
const columnsSchema = z
    .strictObject({
        ...base,
        type: z.literal("columns"),
        ratio: z.enum(COLUMN_RATIOS).default("50-50"),
        columns: z.array(z.array(simpleBlockSchema).max(PORTFOLIO_COLUMN_BLOCKS_MAX, `Até ${PORTFOLIO_COLUMN_BLOCKS_MAX} blocos por coluna`)).min(2).max(3),
    })
    .refine((block) => block.columns.length === COLUMN_COUNT[block.ratio], { message: "Número de colunas diferente da proporção", path: ["columns"] })

export const portfolioBlockSchema = z.discriminatedUnion("type", [headingSchema, textSchema, imageSchema, gallerySchema, buttonSchema, testimonialSchema, separatorSchema, featuredSchema, columnsSchema, sectionSchema])

export const portfolioBlocksSchema = z.array(portfolioBlockSchema).superRefine((blocks, context) => {
    const ids = allBlocks(blocks).map((block) => block.id)
    if (ids.length > PORTFOLIO_BLOCKS_MAX) context.addIssue({ code: "custom", message: `Até ${PORTFOLIO_BLOCKS_MAX} blocos na página` })
    if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Bloco repetido na página" })
})

export type PortfolioBlock = z.infer<typeof portfolioBlockSchema>
export type SimpleBlock = z.infer<typeof simpleBlockSchema>
export type ColumnsBlock = Extract<PortfolioBlock, { type: "columns" }>
export type SectionBlock = Extract<PortfolioBlock, { type: "section" }>
export type FeaturedBlock = Extract<PortfolioBlock, { type: "featured" }>
export type BlockOf<T extends PortfolioBlockType> = Extract<PortfolioBlock, { type: T }>

// ── Criação ────────────────────────────────────────────────────────────────

/** Id curto e aleatório do bloco (navegador e servidor). */
export function newBlockId(): string {
    const bytes = new Uint8Array(9)
    globalThis.crypto.getRandomValues(bytes)
    return `b_${Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 14)}`
}

export const DEFAULT_STYLE: BlockStyle = { background: "none", spacing: "md", align: "left" }

/** Bloco novo com os valores padrão. `init` sobrescreve campos (ex.: fonte da seção, imagem). */
export function newBlock<T extends PortfolioBlockType>(type: T, init: Partial<Omit<BlockOf<T>, "type" | "id">> = {}): BlockOf<T> {
    const id = newBlockId()
    const defaults: { [K in PortfolioBlockType]: Omit<BlockOf<K>, "id" | "type" | "style"> } = {
        heading: { text: "Novo título", level: 2 },
        text: { markdown: "" },
        image: { mediaId: null, alt: "", caption: "", width: "contained" },
        gallery: { mediaIds: [], layout: "grid", columns: 3 },
        button: { label: "Fale comigo", action: "whatsapp", url: "", variant: "solid" },
        testimonial: { quote: "", author: "", role: "", photoId: null },
        separator: { variant: "line", size: "md" },
        columns: { ratio: "50-50", columns: [[], []] },
        section: { source: "successes", title: PORTFOLIO_SECTION_LABELS.successes, mode: "all", picks: [], sort: "manual", limit: null, layout: "grid", columns: 2, showClient: false },
        featured: { source: "successes", refId: "0".repeat(24), showClient: false },
    }
    const block = { id, type, style: { ...DEFAULT_STYLE, ...(type === "button" ? { align: "center" as const } : {}) }, ...defaults[type], ...init } as unknown as PortfolioBlock
    if (block.type === "section" && !("title" in init)) block.title = PORTFOLIO_SECTION_LABELS[block.source]
    return block as BlockOf<T>
}

/** Cópia profunda com ids novos (duplicar). */
export function cloneBlock<T extends PortfolioBlock>(block: T): T {
    const copy = structuredClone(block)
    copy.id = newBlockId()
    if (copy.type === "columns") copy.columns = copy.columns.map((column) => column.map((child) => cloneBlock(child)))
    return copy
}

// ── Navegação e operações (imutáveis) ──────────────────────────────────────

/** Onde soltar: na página (`parentId: null`) ou numa coluna de um bloco Colunas. */
export interface BlockTarget {
    parentId: string | null
    column?: number
    index: number
}

export interface BlockLocation {
    parentId: string | null
    column: number | null
    index: number
}

/** Todos os blocos, inclusive os das colunas (em ordem de leitura). */
export function allBlocks(blocks: readonly PortfolioBlock[]): PortfolioBlock[] {
    return blocks.flatMap((block): PortfolioBlock[] => (block.type === "columns" ? [block, ...block.columns.flat()] : [block]))
}

export const countBlocks = (blocks: readonly PortfolioBlock[]) => allBlocks(blocks).length

export function findBlock(blocks: readonly PortfolioBlock[], id: string): PortfolioBlock | null {
    return allBlocks(blocks).find((block) => block.id === id) ?? null
}

export function locateBlock(blocks: readonly PortfolioBlock[], id: string): BlockLocation | null {
    for (const [index, block] of blocks.entries()) {
        if (block.id === id) return { parentId: null, column: null, index }
        if (block.type !== "columns") continue
        for (const [column, children] of block.columns.entries()) {
            const at = children.findIndex((child) => child.id === id)
            if (at >= 0) return { parentId: block.id, column, index: at }
        }
    }
    return null
}

/** Lista do contêiner (página ou coluna). */
function containerOf(blocks: readonly PortfolioBlock[], parentId: string | null, column = 0): readonly PortfolioBlock[] | null {
    if (parentId === null) return blocks
    const parent = blocks.find((block) => block.id === parentId)
    return parent?.type === "columns" ? (parent.columns[column] ?? null) : null
}

function withContainer(blocks: PortfolioBlock[], parentId: string | null, column: number, change: (list: PortfolioBlock[]) => PortfolioBlock[]): PortfolioBlock[] {
    if (parentId === null) return change(blocks)
    return blocks.map((block) => (block.id === parentId && block.type === "columns" ? { ...block, columns: block.columns.map((children, at) => (at === column ? (change(children) as SimpleBlock[]) : children)) } : block))
}

export function updateBlock(blocks: readonly PortfolioBlock[], id: string, change: (block: PortfolioBlock) => PortfolioBlock): PortfolioBlock[] {
    return blocks.map((block) => {
        if (block.id === id) return change(block)
        if (block.type !== "columns") return block
        return { ...block, columns: block.columns.map((children) => children.map((child) => (child.id === id ? (change(child) as SimpleBlock) : child))) } as PortfolioBlock
    })
}

export function removeBlock(blocks: readonly PortfolioBlock[], id: string): PortfolioBlock[] {
    return blocks.filter((block) => block.id !== id).map((block) => (block.type === "columns" ? { ...block, columns: block.columns.map((children) => children.filter((child) => child.id !== id)) } : block))
}

/** Motivo de não poder soltar (`null` = pode). */
export function dropProblem(blocks: readonly PortfolioBlock[], type: PortfolioBlockType, target: BlockTarget, movingId?: string): string | null {
    const container = containerOf(blocks, target.parentId, target.column)
    if (!container) return "Destino inválido"
    if (target.parentId !== null) {
        if (!isSimpleType(type)) return `${BLOCK_LABELS[type]} não pode ficar dentro de colunas`
        const inside = movingId ? container.some((block) => block.id === movingId) : false
        if (!inside && container.length >= PORTFOLIO_COLUMN_BLOCKS_MAX) return `Até ${PORTFOLIO_COLUMN_BLOCKS_MAX} blocos por coluna`
        if (movingId === target.parentId) return "Destino inválido"
    }
    if (!movingId && countBlocks(blocks) >= PORTFOLIO_BLOCKS_MAX) return `Até ${PORTFOLIO_BLOCKS_MAX} blocos na página`
    return null
}

/** Insere o bloco no destino (índice limitado ao tamanho do contêiner). Sem destino válido, devolve igual. */
export function insertBlock(blocks: readonly PortfolioBlock[], block: PortfolioBlock, target: BlockTarget): PortfolioBlock[] {
    if (dropProblem(blocks, block.type, target)) return [...blocks]
    return withContainer([...blocks], target.parentId, target.column ?? 0, (list) => {
        const next = [...list]
        next.splice(Math.max(0, Math.min(target.index, next.length)), 0, block)
        return next
    })
}

/** Move o bloco para o destino (o índice é o da lista ANTES de tirar o bloco). */
export function moveBlock(blocks: readonly PortfolioBlock[], id: string, target: BlockTarget): PortfolioBlock[] {
    const block = findBlock(blocks, id)
    const from = locateBlock(blocks, id)
    if (!block || !from || dropProblem(blocks, block.type, target, id)) return [...blocks]
    const sameContainer = from.parentId === target.parentId && (from.column ?? 0) === (target.column ?? 0)
    const index = sameContainer && from.index < target.index ? target.index - 1 : target.index
    if (sameContainer && index === from.index) return [...blocks]
    const without = removeBlock(blocks, id)
    return withContainer(without, target.parentId, target.column ?? 0, (list) => {
        const next = [...list]
        next.splice(Math.max(0, Math.min(index, next.length)), 0, block)
        return next
    })
}

/** Sobe/desce uma posição no mesmo contêiner (botões ↑/↓ e teclado). */
export function shiftBlock(blocks: readonly PortfolioBlock[], id: string, delta: -1 | 1): PortfolioBlock[] {
    const from = locateBlock(blocks, id)
    if (!from) return [...blocks]
    const size = containerOf(blocks, from.parentId, from.column ?? 0)?.length ?? 0
    const to = from.index + delta
    if (to < 0 || to >= size) return [...blocks]
    return moveBlock(blocks, id, { parentId: from.parentId, column: from.column ?? 0, index: delta > 0 ? to + 1 : to })
}

export function duplicateBlock(blocks: readonly PortfolioBlock[], id: string): { blocks: PortfolioBlock[]; id: string | null } {
    const block = findBlock(blocks, id)
    const at = locateBlock(blocks, id)
    if (!block || !at) return { blocks: [...blocks], id: null }
    const copy = cloneBlock(block)
    const target = { parentId: at.parentId, column: at.column ?? 0, index: at.index + 1 }
    if (dropProblem(blocks, copy.type, target) || countBlocks(blocks) + countBlocks([copy]) > PORTFOLIO_BLOCKS_MAX) return { blocks: [...blocks], id: null }
    return { blocks: insertBlock(blocks, copy, target), id: copy.id }
}

/** Troca a proporção das colunas: ao reduzir de 3 para 2, os blocos da 3ª vão para a 2ª. */
export function setColumnRatio(block: ColumnsBlock, ratio: ColumnRatio): ColumnsBlock {
    const count = COLUMN_COUNT[ratio]
    const columns = block.columns.slice(0, count).map((column) => [...column])
    while (columns.length < count) columns.push([])
    if (block.columns.length > count) columns[count - 1] = [...columns[count - 1]!, ...block.columns.slice(count).flat()]
    return { ...block, ratio, columns }
}

/** Acrescenta um item escolhido à seção (sem repetir; passa a seção para "escolher um a um"). */
export function addSectionPick(block: SectionBlock, id: string): SectionBlock {
    if (block.picks.some((pick) => pick.id === id) || block.picks.length >= PORTFOLIO_SECTION_PICKS_MAX) return { ...block, mode: "picked" }
    return { ...block, mode: "picked", picks: [...block.picks, { id, showClient: false }] }
}

// ── Referências ────────────────────────────────────────────────────────────

/** Imagens da mídia usadas nos blocos. */
export function mediaIdsOf(blocks: readonly PortfolioBlock[]): string[] {
    const ids = allBlocks(blocks).flatMap((block) => (block.type === "image" ? [block.mediaId] : block.type === "gallery" ? block.mediaIds : block.type === "testimonial" ? [block.photoId] : []))
    return [...new Set(ids.filter((id): id is string => Boolean(id)))]
}

/** Tira um conteúdo excluído dos blocos (destaques com ele saem; das seções sai o escolhido). */
export function pruneContentRef(blocks: readonly PortfolioBlock[], source: PortfolioSectionKey, id: string): PortfolioBlock[] {
    const keep = (block: PortfolioBlock) => !(block.type === "featured" && block.source === source && block.refId === id)
    const clean = (block: PortfolioBlock): PortfolioBlock => (block.type === "section" && block.source === source ? { ...block, picks: block.picks.filter((pick) => pick.id !== id) } : block)
    return blocks.filter(keep).map((block) => (block.type === "columns" ? { ...block, columns: block.columns.map((children) => children.filter(keep).map((child) => clean(child) as SimpleBlock)) } : clean(block)))
}

/** Tira uma imagem excluída da mídia dos blocos. */
export function pruneMediaRef(blocks: readonly PortfolioBlock[], mediaId: string): PortfolioBlock[] {
    const clean = (block: PortfolioBlock): PortfolioBlock => {
        if (block.type === "image" && block.mediaId === mediaId) return { ...block, mediaId: null }
        if (block.type === "gallery") return { ...block, mediaIds: block.mediaIds.filter((id) => id !== mediaId) }
        if (block.type === "testimonial" && block.photoId === mediaId) return { ...block, photoId: null }
        if (block.type === "columns") return { ...block, columns: block.columns.map((children) => children.map((child) => clean(child) as SimpleBlock)) }
        return block
    }
    return blocks.map(clean)
}

// ── Publicação ─────────────────────────────────────────────────────────────

export interface BlockProblem {
    blockId: string
    message: string
}

const httpUrl = (value: string) => {
    try {
        const url = new URL(value)
        return url.protocol === "https:" || url.protocol === "http:"
    } catch {
        return false
    }
}

/** O que impede publicar (o rascunho aceita blocos incompletos). */
export function publishProblems(blocks: readonly PortfolioBlock[]): BlockProblem[] {
    const out: BlockProblem[] = []
    for (const block of allBlocks(blocks)) {
        const problem = (message: string) => out.push({ blockId: block.id, message })
        if (block.type === "heading" && !block.text.trim()) problem("Título vazio")
        if (block.type === "image" && !block.mediaId) problem("Imagem sem arquivo: escolha uma imagem da mídia")
        if (block.type === "image" && block.mediaId && !block.alt.trim()) problem("Imagem sem texto alternativo (descrição para quem não enxerga a imagem)")
        if (block.type === "button" && !block.label.trim()) problem("Botão sem rótulo")
        if (block.type === "button" && block.action === "link" && !httpUrl(block.url.trim())) problem("Botão de link sem endereço válido (https://…)")
        if (block.type === "testimonial" && (!block.quote.trim() || !block.author.trim())) problem("Depoimento sem citação ou sem autor")
    }
    return out
}

/** Nome curto do bloco para listas e leitores de tela. */
export function blockSummary(block: PortfolioBlock): string {
    const label = block.type === "section" ? `${BLOCK_LABELS.section}: ${block.title.trim() || SOURCE_LABELS[block.source].many}` : BLOCK_LABELS[block.type]
    if (block.type === "heading" && block.text.trim()) return `${label}: ${block.text.trim().slice(0, 40)}`
    if (block.type === "featured") return `${label} (${SOURCE_LABELS[block.source].one.toLowerCase()})`
    if (block.type === "columns") return `${label} (${block.columns.length})`
    return label
}
