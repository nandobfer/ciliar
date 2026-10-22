"use client"

import type { MouseEvent, ReactNode } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import { CalendarDays, Download, ExternalLink, FileText, ImageOff, Mail, MessageCircle, Phone, Quote } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatAttachmentSize } from "@/lib/attachments"
import { withBasePath } from "@/lib/base-path"
import { cn } from "@/lib/utils"
import type { BlockStyle, ColumnRatio } from "../blocks"
import { SOURCE_LABELS } from "../blocks"
import type { ContentCard, ResolvedBlock, ResolvedFile, ResolvedSimpleBlock } from "../resolve"
import type { PortfolioBusinessDto } from "../types"

/**
 * Exibição dos blocos do portfólio (M5): a MESMA renderização na página pública, na pré-visualização
 * e no editor (com `editor`, blocos vazios/indisponíveis aparecem como avisos para o prestador).
 * Cabeçalho e contato são fixos (Ficha do negócio).
 */

export type OpenFile = (event: MouseEvent<HTMLAnchorElement>, fileId: string, mode: "view" | "download") => void
const noop: OpenFile = () => undefined

const dateLabel = (key: string | null) => (key ? key.split("-").reverse().join("/") : null)

const BACKGROUND: Record<BlockStyle["background"], string> = {
    none: "",
    subtle: "rounded-xl bg-muted/50 px-4 @3xl:px-6",
    primary: "rounded-xl bg-primary px-4 text-primary-foreground @3xl:px-6 [&_.text-muted-foreground]:text-primary-foreground/80 [&_.text-primary]:text-primary-foreground",
}
const SPACING: Record<BlockStyle["spacing"], string> = { sm: "py-2", md: "py-4", lg: "py-8 @3xl:py-10" }
export const COLUMN_GRID: Record<ColumnRatio, string> = {
    "50-50": "@3xl:grid-cols-2",
    "33-67": "@3xl:grid-cols-[1fr_2fr]",
    "67-33": "@3xl:grid-cols-[2fr_1fr]",
    "33-33-33": "@3xl:grid-cols-3",
}

/** Classes do estilo do bloco (fundo, espaçamento e alinhamento). */
export function blockStyleClass(style: BlockStyle): string {
    return cn(BACKGROUND[style.background], SPACING[style.spacing], style.align === "center" && "text-center")
}

// ── Texto restrito (negrito, itálico, links e listas) ──────────────────────

/** Tira a prop `node` (AST) que o react-markdown repassa e o DOM não aceita. */
function rest<P extends { node?: unknown }>(props: P): Omit<P, "node"> {
    const { node, ...others } = props
    void node
    return others
}

const markdownComponents: Components = {
    p: (props) => <p className="mb-3 leading-relaxed last:mb-0" {...rest(props)} />,
    ul: (props) => <ul className="mb-3 inline-block list-disc space-y-1 pl-5 text-left last:mb-0" {...rest(props)} />,
    ol: (props) => <ol className="mb-3 inline-block list-decimal space-y-1 pl-5 text-left last:mb-0" {...rest(props)} />,
    a: (props) => <a className="font-medium text-primary underline underline-offset-2" target="_blank" rel="noreferrer noopener" {...rest(props)} />,
}
const SAFE_URL = /^(https?:|mailto:|tel:)/i

export function PortfolioMarkdown({ children, className }: { children: string; className?: string }) {
    return (
        <div className={cn("break-words text-base", className)}>
            <ReactMarkdown allowedElements={["p", "strong", "em", "a", "ul", "ol", "li", "br"]} unwrapDisallowed components={markdownComponents} urlTransform={(url) => (SAFE_URL.test(url) ? url : "")}>
                {children}
            </ReactMarkdown>
        </div>
    )
}

// ── Cabeçalho e contato (fixos) ────────────────────────────────────────────

export function PortfolioHeaderView({ business }: { business: PortfolioBusinessDto }) {
    return (
        <header className="flex flex-col items-center gap-4 text-center @xl:flex-row @xl:items-center @xl:text-left">
            {business.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo servida pela rota do app (sem otimização)
                <img src={withBasePath(business.logoUrl)} alt={`Logo de ${business.name}`} className="h-20 w-20 shrink-0 rounded-xl border object-cover" />
            ) : (
                <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-primary text-3xl font-bold text-primary-foreground" aria-hidden>
                    {business.name.slice(0, 1).toUpperCase()}
                </span>
            )}
            <div className="min-w-0 flex-1 space-y-1">
                <h1 className="text-2xl font-bold @3xl:text-3xl">{business.name}</h1>
                {business.segment && <p className="text-sm font-medium text-primary">{business.segment}</p>}
                {business.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{business.description}</p>}
            </div>
        </header>
    )
}

export function PortfolioContactView({ business }: { business: PortfolioBusinessDto }) {
    if (!business.contactEmail && !business.contactPhone && !business.links.length) return null
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Contato</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3 text-sm">
                {business.contactEmail && (
                    <a href={`mailto:${business.contactEmail}`} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 hover:border-primary/60">
                        <Mail className="h-4 w-4 text-primary" aria-hidden /> {business.contactEmail}
                    </a>
                )}
                {business.contactPhone && (
                    <a href={`tel:${business.contactPhone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 hover:border-primary/60">
                        <Phone className="h-4 w-4 text-primary" aria-hidden /> {business.contactPhone}
                    </a>
                )}
                {business.whatsappUrl && (
                    <a href={business.whatsappUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground hover:bg-primary/90">
                        <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
                    </a>
                )}
                {business.links.map((link) => (
                    <a key={link} href={link} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 hover:border-primary/60">
                        <ExternalLink className="h-4 w-4 text-primary" aria-hidden /> {link.replace(/^https?:\/\//, "")}
                    </a>
                ))}
            </CardContent>
        </Card>
    )
}

// ── Blocos ─────────────────────────────────────────────────────────────────

function Placeholder({ children }: { children: ReactNode }) {
    return <div className="flex min-h-20 items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">{children}</div>
}

function FileImage({ file, alt, className, onOpenFile }: { file: ResolvedFile; alt: string; className?: string; onOpenFile: OpenFile }) {
    return (
        <a href={file.viewUrl ?? file.downloadUrl} target="_blank" rel="noreferrer noopener" onClick={(event) => onOpenFile(event, file.id, "view")} className="block overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage ou rota autenticada */}
            <img src={file.viewUrl ?? undefined} alt={alt} className={cn("w-full object-cover", className)} loading="lazy" />
        </a>
    )
}

function Gallery({ files, layout = "grid", columns = 3, onOpenFile }: { files: ResolvedFile[]; layout?: "grid" | "carousel"; columns?: 2 | 3 | 4; onOpenFile: OpenFile }) {
    const images = files.filter((file) => file.kind === "image")
    if (!images.length) return null
    if (layout === "carousel") {
        return (
            <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2" aria-label="Galeria de imagens" tabIndex={0}>
                {images.map((image) => (
                    <li key={image.id} className="w-4/5 shrink-0 snap-start @xl:w-2/5">
                        <FileImage file={image} alt={image.name} className="aspect-video" onOpenFile={onOpenFile} />
                    </li>
                ))}
            </ul>
        )
    }
    return (
        <ul className={cn("grid grid-cols-2 gap-2", columns === 3 && "@xl:grid-cols-3", columns === 4 && "@xl:grid-cols-4")}>
            {images.map((image) => (
                <li key={image.id}>
                    <FileImage file={image} alt={image.name} className="aspect-video transition-transform hover:scale-[1.02] motion-reduce:transition-none" onOpenFile={onOpenFile} />
                </li>
            ))}
        </ul>
    )
}

function DownloadLink({ file, onOpenFile }: { file: ResolvedFile; onOpenFile: OpenFile }) {
    return (
        <a href={file.downloadUrl} target="_blank" rel="noreferrer noopener" onClick={(event) => onOpenFile(event, file.id, "download")} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:border-primary/60">
            {file.kind === "file" ? <FileText className="h-4 w-4 text-muted-foreground" aria-hidden /> : <Download className="h-4 w-4 text-muted-foreground" aria-hidden />}
            <span>Baixar</span>
            <span className="text-xs text-muted-foreground">{formatAttachmentSize(file.size)}</span>
        </a>
    )
}

/** Card de um conteúdo do negócio (seções e destaque). `large` = destaque. */
export function ContentCardView({ card, onOpenFile = noop, large = false }: { card: ContentCard; onOpenFile?: OpenFile; large?: boolean }) {
    if (card.source === "services") {
        return (
            <Card className={cn("h-full p-4 text-left", large && "p-6")}>
                <p className={cn("font-semibold", large && "text-xl")}>{card.name}</p>
                {card.description && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{card.description}</p>}
            </Card>
        )
    }
    if (card.source === "documents") {
        return (
            <Card className="h-full text-left">
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
                    <div className="min-w-0">
                        <CardTitle className={cn("text-base", large && "text-xl")}>{card.name}</CardTitle>
                        {card.description && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{card.description}</p>}
                    </div>
                    {card.file && <DownloadLink file={card.file} onOpenFile={onOpenFile} />}
                </CardHeader>
                {card.file?.viewUrl && card.file.kind !== "file" && (
                    <CardContent>
                        {card.file.kind === "image" ? (
                            <FileImage file={card.file} alt={card.name} className="max-h-[32rem] rounded-md border object-contain" onOpenFile={onOpenFile} />
                        ) : (
                            <iframe src={card.file.viewUrl} title={card.name} className={cn("w-full rounded-md border bg-white", large ? "h-[36rem]" : "h-[28rem]")} />
                        )}
                    </CardContent>
                )}
            </Card>
        )
    }
    const meta = (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {card.source === "successes" && card.client && (
                <span className="inline-flex items-center gap-1">
                    <Quote className="h-3.5 w-3.5" aria-hidden /> {card.client}
                </span>
            )}
            {card.date && (
                <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {dateLabel(card.date)}
                </span>
            )}
            {card.source === "items" &&
                card.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary">
                        {tag}
                    </span>
                ))}
        </div>
    )
    return (
        <Card className={cn("h-full text-left", large && "@3xl:grid @3xl:grid-cols-2 @3xl:items-start @3xl:gap-2")}>
            {large && card.images[0] && (
                <div className="p-4 @3xl:pr-0">
                    <FileImage file={card.images[0]} alt={card.images[0].name} className="aspect-video rounded-lg" onOpenFile={onOpenFile} />
                </div>
            )}
            <div>
                <CardHeader className="space-y-1">
                    <CardTitle className={cn("text-base", large && "text-2xl")}>{card.title}</CardTitle>
                    {meta}
                </CardHeader>
                <CardContent className="space-y-3">
                    {card.source === "successes" && card.result && <p className="rounded-md bg-primary/10 px-2 py-1 text-sm font-medium text-primary">{card.result}</p>}
                    {card.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{card.description}</p>}
                    <Gallery files={large ? card.images.slice(1) : card.images} onOpenFile={onOpenFile} />
                    {card.source === "items" && card.url && (
                        <a href={card.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                            <ExternalLink className="h-4 w-4" aria-hidden /> Ver projeto
                        </a>
                    )}
                </CardContent>
            </div>
        </Card>
    )
}

function Cards({ cards, layout, columns, onOpenFile }: { cards: ContentCard[]; layout: "grid" | "list" | "carousel"; columns: 2 | 3; onOpenFile: OpenFile }) {
    if (layout === "carousel") {
        return (
            <ul className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2" tabIndex={0} aria-label="Carrossel">
                {cards.map((card) => (
                    <li key={card.id} className="w-[85%] shrink-0 snap-start @xl:w-[45%] @5xl:w-[32%]">
                        <ContentCardView card={card} onOpenFile={onOpenFile} />
                    </li>
                ))}
            </ul>
        )
    }
    return (
        <ul className={cn("grid gap-4", layout === "grid" && (columns === 3 ? "@xl:grid-cols-2 @5xl:grid-cols-3" : "@3xl:grid-cols-2"))}>
            {cards.map((card) => (
                <li key={card.id}>
                    <ContentCardView card={card} onOpenFile={onOpenFile} />
                </li>
            ))}
        </ul>
    )
}

/** Conteúdo de um bloco simples (sem o estilo externo). */
export function SimpleBlockBody({ block, onOpenFile = noop, editor = false }: { block: ResolvedSimpleBlock; onOpenFile?: OpenFile; editor?: boolean }) {
    switch (block.type) {
        case "heading": {
            const Tag = block.level === 2 ? "h2" : "h3"
            if (!block.text.trim()) return editor ? <Placeholder>Título vazio</Placeholder> : null
            return <Tag className={cn("font-bold", block.level === 2 ? "text-2xl @3xl:text-3xl" : "text-xl")}>{block.text}</Tag>
        }
        case "text":
            return block.markdown.trim() ? <PortfolioMarkdown>{block.markdown}</PortfolioMarkdown> : editor ? <Placeholder>Texto vazio: clique para escrever</Placeholder> : null
        case "image":
            if (!block.file || block.file.kind !== "image")
                return editor ? (
                    <Placeholder>
                        <ImageOff className="h-4 w-4" aria-hidden /> Escolha uma imagem da mídia
                    </Placeholder>
                ) : null
            return (
                <figure className={cn("space-y-2", block.width === "contained" && "mx-auto max-w-3xl")}>
                    <FileImage file={block.file} alt={block.alt} className="rounded-lg" onOpenFile={onOpenFile} />
                    {block.caption && <figcaption className="text-center text-sm text-muted-foreground">{block.caption}</figcaption>}
                </figure>
            )
        case "gallery":
            return block.files.length ? <Gallery files={block.files} layout={block.layout} columns={block.columns} onOpenFile={onOpenFile} /> : editor ? <Placeholder>Galeria vazia: escolha imagens da mídia</Placeholder> : null
        case "button": {
            const className = cn("inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold", block.variant === "solid" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border-2 border-primary text-primary hover:bg-primary/10")
            const icon = block.action === "whatsapp" ? <MessageCircle className="h-4 w-4" aria-hidden /> : block.action === "email" ? <Mail className="h-4 w-4" aria-hidden /> : block.action === "phone" ? <Phone className="h-4 w-4" aria-hidden /> : <ExternalLink className="h-4 w-4" aria-hidden />
            if (!block.href) {
                return editor ? (
                    <span className="space-y-1">
                        <span className={cn(className, "opacity-60")}>
                            {icon} {block.label || "Botão"}
                        </span>
                        <span className="block text-xs text-warning">Sem destino: confira o contato na Ficha ou o link do botão.</span>
                    </span>
                ) : null
            }
            return (
                <a href={block.href} target={block.action === "link" || block.action === "whatsapp" ? "_blank" : undefined} rel="noreferrer noopener" className={className} onClick={editor ? (event) => event.preventDefault() : undefined}>
                    {icon} {block.label}
                </a>
            )
        }
        case "testimonial":
            if (!block.quote.trim()) return editor ? <Placeholder>Depoimento vazio</Placeholder> : null
            return (
                <figure className={cn("mx-auto max-w-3xl space-y-3", block.style.align === "center" && "flex flex-col items-center")}>
                    <Quote className="h-6 w-6 text-primary" aria-hidden />
                    <blockquote className="whitespace-pre-wrap text-lg italic leading-relaxed">“{block.quote}”</blockquote>
                    <figcaption className="flex items-center gap-3">
                        {block.photo?.viewUrl && (
                            // eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage ou rota autenticada
                            <img src={block.photo.viewUrl} alt={block.author} className="h-10 w-10 rounded-full object-cover" />
                        )}
                        <span className="text-left text-sm">
                            <span className="block font-semibold">{block.author}</span>
                            {block.role && <span className="block text-muted-foreground">{block.role}</span>}
                        </span>
                    </figcaption>
                </figure>
            )
        case "separator":
            return block.variant === "line" ? <hr className={cn("border-border", block.size === "sm" ? "my-1" : block.size === "md" ? "my-4" : "my-8")} /> : <div aria-hidden className={block.size === "sm" ? "h-4" : block.size === "md" ? "h-10" : "h-20"} />
        case "featured":
            if (!block.card) return editor ? <Placeholder>{SOURCE_LABELS[block.source].one} indisponível (arquivado, desmarcado, inativo ou excluído)</Placeholder> : null
            return <ContentCardView card={block.card} onOpenFile={onOpenFile} large />
    }
}

/** Conteúdo de uma seção (título e cards). */
export function SectionBody({ block, onOpenFile = noop, editor = false }: { block: Extract<ResolvedBlock, { type: "section" }>; onOpenFile?: OpenFile; editor?: boolean }) {
    return (
        <section aria-label={block.title || SOURCE_LABELS[block.source].many} className="space-y-4">
            {block.title.trim() && <h2 className="text-xl font-semibold @3xl:text-2xl">{block.title}</h2>}
            {block.cards.length ? <Cards cards={block.cards} layout={block.layout} columns={block.columns} onOpenFile={onOpenFile} /> : editor ? <Placeholder>Nenhum {SOURCE_LABELS[block.source].one.toLowerCase()} disponível nesta seção</Placeholder> : null}
            {editor && block.missing > 0 && <p className="text-xs text-warning">{block.missing} escolhido(s) indisponível(is) não aparece(m) (arquivado, desmarcado ou inativo).</p>}
        </section>
    )
}

/** Página: os blocos na ordem, cada um com o seu estilo. */
export function BlocksView({ blocks, onOpenFile = noop }: { blocks: ResolvedBlock[]; onOpenFile?: OpenFile }) {
    return (
        <div className="flex flex-col gap-4">
            {blocks.map((block) => (
                <div key={block.id} className={blockStyleClass(block.style)} data-block-type={block.type}>
                    {block.type === "section" ? (
                        <SectionBody block={block} onOpenFile={onOpenFile} />
                    ) : block.type === "columns" ? (
                        <div className={cn("grid gap-6", COLUMN_GRID[block.ratio])}>
                            {block.columns.map((children, index) => (
                                <div key={index} className="flex min-w-0 flex-col gap-4">
                                    {children.map((child) => (
                                        <div key={child.id} className={blockStyleClass(child.style)}>
                                            <SimpleBlockBody block={child} onOpenFile={onOpenFile} />
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <SimpleBlockBody block={block} onOpenFile={onOpenFile} />
                    )}
                </div>
            ))}
        </div>
    )
}
