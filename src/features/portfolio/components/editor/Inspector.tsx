"use client"

import type { ReactNode } from "react"
import { ArrowDown, ArrowUp, ChevronRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { MarkdownField } from "@/components/ui/markdown-field"
import { SearchPicker } from "@/components/ui/search-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
    allBlocks,
    BLOCK_LABELS,
    blockSummary,
    COLUMN_RATIOS,
    findBlock,
    locateBlock,
    PORTFOLIO_GALLERY_MAX,
    setColumnRatio,
    shiftBlock,
    SOURCE_LABELS,
    updateBlock,
    type BlockOf,
    type BlockStyle,
    type ColumnRatio,
    type PortfolioBlock,
    type SectionBlock,
} from "../../blocks"
import { PORTFOLIO_SECTION_KEYS, PORTFOLIO_SECTION_LABELS, type PortfolioSectionKey } from "../../constants"
import { BLOCK_ICONS } from "./block-icons"
import { usePortfolioEditor } from "./context"
import { MediaLibrary } from "./MediaLibrary"

/**
 * Barra direita: propriedades do bloco selecionado (todas as opções do bloco e o estilo) ou, sem
 * seleção, a árvore dos blocos da página (navegação pelo teclado e reordenação por ↑/↓).
 */
export function Inspector() {
    const { blocks, selected } = usePortfolioEditor()
    const block = selected ? findBlock(blocks, selected) : null
    return <div className="min-h-0 flex-1 overflow-y-auto p-3">{block ? <BlockProperties block={block} /> : <BlockTree />}</div>
}

const RATIO_LABELS: Record<ColumnRatio, string> = { "50-50": "2 colunas iguais", "33-67": "1/3 + 2/3", "67-33": "2/3 + 1/3", "33-33-33": "3 colunas iguais" }

function Field({ id, label, hint, children }: { id: string; label: string; hint?: ReactNode; children: ReactNode }) {
    return (
        <div className="space-y-1">
            <label htmlFor={id} className="text-xs font-semibold">
                {label}
            </label>
            {children}
            {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        </div>
    )
}

function Choice<T extends string>({ id, label, value, options, onChange, disabled }: { id: string; label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void; disabled?: boolean }) {
    return (
        <Field id={id} label={label}>
            <Select value={value} disabled={disabled} onValueChange={(next) => next && onChange(next as T)}>
                <SelectTrigger id={id} className="h-8 w-full text-xs">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {options.map(([key, text]) => (
                        <SelectItem key={key} value={key}>
                            {text}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </Field>
    )
}

function BlockProperties({ block }: { block: PortfolioBlock }) {
    const { blocks, change, select, readOnly } = usePortfolioEditor()
    const Icon = BLOCK_ICONS[block.type]
    const id = (name: string) => `block-${block.id}-${name}`
    const patch = (next: Partial<PortfolioBlock>, key?: string) => change(updateBlock(blocks, block.id, (current) => ({ ...current, ...next }) as PortfolioBlock), key)
    const style = (next: Partial<BlockStyle>) => patch({ style: { ...block.style, ...next } })
    const parent = locateBlock(blocks, block.id)?.parentId

    return (
        <fieldset disabled={readOnly} className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className="h-4 w-4 text-primary" aria-hidden /> {BLOCK_LABELS[block.type]}
                </h2>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => select(parent ?? null)}>
                    {parent ? "Selecionar colunas" : "Ver todos os blocos"}
                </Button>
            </div>

            {block.type === "heading" && (
                <>
                    <Field id={id("text")} label="Texto">
                        <Input id={id("text")} value={block.text} maxLength={200} onChange={(event) => patch({ text: event.target.value }, `${block.id}:text`)} />
                    </Field>
                    <Choice id={id("level")} label="Tamanho" value={String(block.level) as "2" | "3"} options={[["2", "Grande (H2)"], ["3", "Médio (H3)"]]} onChange={(level) => patch({ level: Number(level) as 2 | 3 })} />
                </>
            )}
            {block.type === "text" && (
                <Field id={id("markdown")} label="Texto" hint="Negrito, itálico, links e listas.">
                    <MarkdownField id={id("markdown")} value={block.markdown} rows={8} tools={["bold", "italic", "link", "list"]} onChange={(markdown) => patch({ markdown: markdown.slice(0, 5000) }, `${block.id}:markdown`)} />
                </Field>
            )}
            {block.type === "image" && (
                <>
                    <Field id={id("media")} label="Imagem">
                        <MediaLibrary selected={block.mediaId ? [block.mediaId] : []} onToggle={(mediaId) => patch({ mediaId: block.mediaId === mediaId ? null : mediaId })} />
                    </Field>
                    <Field id={id("alt")} label="Texto alternativo (obrigatório para publicar)" hint="Descreva a imagem para quem não a enxerga.">
                        <Input id={id("alt")} value={block.alt} maxLength={200} onChange={(event) => patch({ alt: event.target.value }, `${block.id}:alt`)} />
                    </Field>
                    <Field id={id("caption")} label="Legenda (opcional)">
                        <Input id={id("caption")} value={block.caption} maxLength={300} onChange={(event) => patch({ caption: event.target.value }, `${block.id}:caption`)} />
                    </Field>
                    <Choice id={id("width")} label="Largura" value={block.width} options={[["contained", "Contida"], ["full", "Total"]]} onChange={(width) => patch({ width })} />
                </>
            )}
            {block.type === "gallery" && (
                <>
                    <Field id={id("media")} label={`Imagens (${block.mediaIds.length}/${PORTFOLIO_GALLERY_MAX})`} hint="Clique para incluir ou tirar; a ordem é a da escolha.">
                        <MediaLibrary selected={block.mediaIds} onToggle={(mediaId) => patch({ mediaIds: block.mediaIds.includes(mediaId) ? block.mediaIds.filter((item) => item !== mediaId) : [...block.mediaIds, mediaId].slice(0, PORTFOLIO_GALLERY_MAX) })} />
                    </Field>
                    <Choice id={id("layout")} label="Layout" value={block.layout} options={[["grid", "Grade"], ["carousel", "Carrossel"]]} onChange={(layout) => patch({ layout })} />
                    {block.layout === "grid" && <Choice id={id("columns")} label="Colunas" value={String(block.columns) as "2" | "3" | "4"} options={[["2", "2"], ["3", "3"], ["4", "4"]]} onChange={(columns) => patch({ columns: Number(columns) as 2 | 3 | 4 })} />}
                </>
            )}
            {block.type === "button" && (
                <>
                    <Field id={id("label")} label="Rótulo">
                        <Input id={id("label")} value={block.label} maxLength={60} onChange={(event) => patch({ label: event.target.value }, `${block.id}:label`)} />
                    </Field>
                    <Choice
                        id={id("action")}
                        label="Ao clicar"
                        value={block.action}
                        options={[
                            ["whatsapp", "Abrir o WhatsApp do negócio"],
                            ["email", "Enviar e-mail ao negócio"],
                            ["phone", "Ligar para o negócio"],
                            ["link", "Abrir um link"],
                        ]}
                        onChange={(action) => patch({ action })}
                    />
                    {block.action === "link" ? (
                        <Field id={id("url")} label="Endereço do link">
                            <Input id={id("url")} type="url" placeholder="https://" value={block.url} maxLength={500} onChange={(event) => patch({ url: event.target.value }, `${block.id}:url`)} />
                        </Field>
                    ) : (
                        <p className="text-[11px] text-muted-foreground">Usa o contato da Ficha do negócio. Sem ele, o botão não aparece na página.</p>
                    )}
                    <Choice id={id("variant")} label="Estilo" value={block.variant} options={[["solid", "Cheio"], ["outline", "Contorno"]]} onChange={(variant) => patch({ variant })} />
                </>
            )}
            {block.type === "testimonial" && (
                <>
                    <Field id={id("quote")} label="Citação">
                        <Textarea id={id("quote")} rows={4} value={block.quote} maxLength={1000} onChange={(event) => patch({ quote: event.target.value }, `${block.id}:quote`)} />
                    </Field>
                    <Field id={id("author")} label="Autor">
                        <Input id={id("author")} value={block.author} maxLength={120} onChange={(event) => patch({ author: event.target.value }, `${block.id}:author`)} />
                    </Field>
                    <Field id={id("role")} label="Cargo ou empresa (opcional)">
                        <Input id={id("role")} value={block.role} maxLength={120} onChange={(event) => patch({ role: event.target.value }, `${block.id}:role`)} />
                    </Field>
                    <Field id={id("photo")} label="Foto (opcional)">
                        <MediaLibrary selected={block.photoId ? [block.photoId] : []} onToggle={(mediaId) => patch({ photoId: block.photoId === mediaId ? null : mediaId })} />
                    </Field>
                </>
            )}
            {block.type === "separator" && (
                <>
                    <Choice id={id("variant")} label="Tipo" value={block.variant} options={[["line", "Linha"], ["space", "Só espaço"]]} onChange={(variant) => patch({ variant })} />
                    <Choice id={id("size")} label="Tamanho" value={block.size} options={[["sm", "Pequeno"], ["md", "Médio"], ["lg", "Grande"]]} onChange={(size) => patch({ size })} />
                </>
            )}
            {block.type === "columns" && (
                <>
                    <Choice id={id("ratio")} label="Proporção" value={block.ratio} options={COLUMN_RATIOS.map((ratio) => [ratio, RATIO_LABELS[ratio]] as const)} onChange={(ratio) => change(updateBlock(blocks, block.id, (current) => setColumnRatio(current as BlockOf<"columns">, ratio)))} />
                    <p className="text-[11px] text-muted-foreground">Dentro das colunas entram blocos simples (sem colunas nem seções), até 6 por coluna. No celular, as colunas ficam uma embaixo da outra.</p>
                    <ul className="space-y-1">
                        {block.columns.map((children, column) => (
                            <li key={column} className="text-xs">
                                <span className="font-semibold">Coluna {column + 1}</span>
                                {children.length ? (
                                    <ul className="ml-2 mt-0.5 space-y-0.5">
                                        {children.map((child) => (
                                            <li key={child.id}>
                                                <button type="button" className="text-left text-primary hover:underline" onClick={() => select(child.id)}>
                                                    {blockSummary(child)}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <span className="ml-2 text-muted-foreground">vazia</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </>
            )}
            {block.type === "section" && <SectionProperties block={block} />}
            {block.type === "featured" && <FeaturedProperties block={block} />}

            <div className="space-y-3 border-t pt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estilo</h3>
                <Choice id={id("background")} label="Fundo" value={block.style.background} options={[["none", "Nenhum"], ["subtle", "Suave"], ["primary", "Cor primária"]]} onChange={(background) => style({ background })} />
                <Choice id={id("spacing")} label="Espaçamento" value={block.style.spacing} options={[["sm", "Pequeno"], ["md", "Médio"], ["lg", "Grande"]]} onChange={(spacing) => style({ spacing })} />
                <Choice id={id("align")} label="Alinhamento" value={block.style.align} options={[["left", "À esquerda"], ["center", "Centralizado"]]} onChange={(align) => style({ align })} />
            </div>
        </fieldset>
    )
}

type PoolEntry = { id: string; label: string; detail: string | null; clientName: string | null }

function useEntries(source: PortfolioSectionKey): PoolEntry[] {
    const { portfolio } = usePortfolioEditor()
    const pool = portfolio.pool
    if (source === "successes") return pool.successes.map((entry) => ({ id: entry.id, label: entry.title, detail: entry.result, clientName: entry.clientName }))
    if (source === "services") return pool.services.map((entry) => ({ id: entry.id, label: entry.name, detail: null, clientName: null }))
    if (source === "documents") return pool.documents.map((entry) => ({ id: entry.id, label: entry.name, detail: entry.file.name, clientName: null }))
    return pool.items.map((entry) => ({ id: entry.id, label: entry.title, detail: entry.tags.join(", ") || null, clientName: null }))
}

function SectionProperties({ block }: { block: SectionBlock }) {
    const { blocks, change } = usePortfolioEditor()
    const entries = useEntries(block.source)
    const byId = new Map(entries.map((entry) => [entry.id, entry]))
    const id = (name: string) => `block-${block.id}-${name}`
    const patch = (next: Partial<SectionBlock>, key?: string) => change(updateBlock(blocks, block.id, (current) => ({ ...current, ...next }) as PortfolioBlock), key)
    const candidates = entries.filter((entry) => !block.picks.some((pick) => pick.id === entry.id))
    const movePick = (index: number, delta: -1 | 1) => {
        const picks = [...block.picks]
        const to = index + delta
        if (to < 0 || to >= picks.length) return
        ;[picks[index], picks[to]] = [picks[to]!, picks[index]!]
        patch({ picks })
    }

    return (
        <>
            <Choice
                id={id("source")}
                label="Conteúdo"
                value={block.source}
                options={PORTFOLIO_SECTION_KEYS.map((source) => [source, SOURCE_LABELS[source].many] as const)}
                onChange={(source) => patch({ source, picks: [], title: block.title === PORTFOLIO_SECTION_LABELS[block.source] ? PORTFOLIO_SECTION_LABELS[source] : block.title })}
            />
            <Field id={id("title")} label="Título da seção (opcional)">
                <Input id={id("title")} value={block.title} maxLength={120} onChange={(event) => patch({ title: event.target.value }, `${block.id}:title`)} />
            </Field>
            <Choice
                id={id("mode")}
                label="Itens"
                value={block.mode}
                options={[
                    ["picked", "Escolher um a um"],
                    ["all", "Todos os disponíveis (novos entram sozinhos)"],
                ]}
                onChange={(mode) => patch({ mode })}
            />
            {block.mode === "picked" ? (
                <div className="space-y-1.5">
                    <p className="text-xs font-semibold">Escolhidos ({block.picks.length})</p>
                    {block.picks.length ? (
                        <ol className="space-y-1">
                            {block.picks.map((pick, index) => {
                                const entry = byId.get(pick.id)
                                return (
                                    <li key={pick.id} className="rounded-md border p-1.5 text-xs">
                                        <div className="flex items-center gap-1">
                                            <span className={cn("min-w-0 flex-1 truncate", !entry && "text-muted-foreground line-through")}>{entry?.label ?? "Indisponível"}</span>
                                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="Subir" disabled={index === 0} onClick={() => movePick(index, -1)}>
                                                <ArrowUp className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="Descer" disabled={index === block.picks.length - 1} onClick={() => movePick(index, 1)}>
                                                <ArrowDown className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label={`Tirar ${entry?.label ?? "item"} da seção`} onClick={() => patch({ picks: block.picks.filter((item) => item.id !== pick.id) })}>
                                                <X className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                        {block.source === "successes" && entry?.clientName && (
                                            <label className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                                <Checkbox checked={pick.showClient} onCheckedChange={(value) => patch({ picks: block.picks.map((item) => (item.id === pick.id ? { ...item, showClient: value === true } : item)) })} />
                                                Mostrar o cliente ({pick.showClient ? entry.clientName : "Cliente confidencial"})
                                            </label>
                                        )}
                                    </li>
                                )
                            })}
                        </ol>
                    ) : (
                        <p className="text-[11px] text-muted-foreground">Nenhum escolhido. Adicione aqui ou arraste da aba Conteúdo para a seção.</p>
                    )}
                    <SearchPicker
                        trigger={
                            <Button type="button" variant="outline" size="sm" className="h-7 w-full text-xs" disabled={!candidates.length}>
                                Adicionar {SOURCE_LABELS[block.source].one.toLowerCase()}
                            </Button>
                        }
                        items={candidates}
                        getKey={(entry) => entry.id}
                        searchKeys={["label", "detail"]}
                        renderItem={(entry) => (
                            <span className="min-w-0">
                                <span className="block truncate text-sm">{entry.label}</span>
                                {entry.detail && <span className="block truncate text-xs text-muted-foreground">{entry.detail}</span>}
                            </span>
                        )}
                        onPick={(entry) => patch({ picks: [...block.picks, { id: entry.id, showClient: false }] })}
                        searchLabel="Buscar"
                        listLabel="Disponíveis"
                        emptyText="Nada disponível para adicionar"
                        emptySearchText="Nada encontrado"
                    />
                </div>
            ) : (
                <>
                    <p className="text-[11px] text-muted-foreground">{entries.length} disponível(is) agora.</p>
                    {block.source === "successes" && (
                        <div className="flex items-center justify-between gap-2">
                            <label htmlFor={id("show-client")} className="text-xs">
                                Mostrar o nome dos clientes
                            </label>
                            <Switch id={id("show-client")} checked={block.showClient} onCheckedChange={(showClient) => patch({ showClient })} />
                        </div>
                    )}
                </>
            )}
            <Choice
                id={id("sort")}
                label="Ordem"
                value={block.sort}
                options={[
                    ["manual", block.mode === "picked" ? "A da escolha" : "Padrão"],
                    ["newest", "Mais novos primeiro"],
                    ["oldest", "Mais antigos primeiro"],
                    ["name", "Por nome"],
                ]}
                onChange={(sort) => patch({ sort })}
            />
            <Field id={id("limit")} label="Mostrar no máximo (opcional)">
                <Input id={id("limit")} type="number" min={1} max={100} value={block.limit ?? ""} onChange={(event) => patch({ limit: event.target.value ? Math.min(100, Math.max(1, Math.round(Number(event.target.value)))) : null }, `${block.id}:limit`)} />
            </Field>
            <Choice id={id("layout")} label="Layout" value={block.layout} options={[["grid", "Grade"], ["list", "Lista"], ["carousel", "Carrossel"]]} onChange={(layout) => patch({ layout })} />
            {block.layout === "grid" && <Choice id={id("columns")} label="Colunas" value={String(block.columns) as "2" | "3"} options={[["2", "2"], ["3", "3"]]} onChange={(columns) => patch({ columns: Number(columns) as 2 | 3 })} />}
        </>
    )
}

function FeaturedProperties({ block }: { block: BlockOf<"featured"> }) {
    const { blocks, change, portfolio } = usePortfolioEditor()
    const entries = useEntries(block.source)
    const entry = entries.find((candidate) => candidate.id === block.refId)
    const id = (name: string) => `block-${block.id}-${name}`
    const patch = (next: Partial<BlockOf<"featured">>) => change(updateBlock(blocks, block.id, (current) => ({ ...current, ...next }) as PortfolioBlock))
    return (
        <>
            <Choice id={id("source")} label="Tipo" value={block.source} options={PORTFOLIO_SECTION_KEYS.map((source) => [source, SOURCE_LABELS[source].one] as const)} onChange={(source) => source !== block.source && patch({ source, refId: portfolio.pool[source][0]?.id ?? "0".repeat(24) })} />
            <Choice id={id("item")} label="Item" value={entry ? block.refId : "none"} options={[...(entry ? [] : [["none", "Escolha um item"] as const]), ...entries.map((candidate) => [candidate.id, candidate.label] as const)]} onChange={(refId) => refId !== "none" && patch({ refId })} />
            {block.source === "successes" && entry?.clientName && (
                <div className="flex items-center justify-between gap-2">
                    <label htmlFor={id("show-client")} className="text-xs">
                        Mostrar o cliente ({block.showClient ? entry.clientName : "Cliente confidencial"})
                    </label>
                    <Switch id={id("show-client")} checked={block.showClient} onCheckedChange={(showClient) => patch({ showClient })} />
                </div>
            )}
        </>
    )
}

/** Sem seleção: todos os blocos (com os de dentro das colunas), para navegar e reordenar. */
function BlockTree() {
    const { blocks, select, change, readOnly } = usePortfolioEditor()
    const flat = allBlocks(blocks).map((block) => ({ block, nested: Boolean(locateBlock(blocks, block.id)?.parentId) }))
    return (
        <div className="space-y-2">
            <h2 className="text-sm font-semibold">Blocos da página</h2>
            <p className="text-xs text-muted-foreground">Selecione um bloco para editar. Cabeçalho e contato são fixos.</p>
            {flat.length ? (
                <ol className="space-y-1" aria-label="Blocos da página">
                    {flat.map(({ block, nested }) => {
                        const Icon = BLOCK_ICONS[block.type]
                        return (
                            <li key={block.id} className={cn("flex items-center gap-1 rounded-md border bg-background", nested && "ml-4")}>
                                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-xs hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => select(block.id)}>
                                    <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                                    <span className="truncate">{blockSummary(block)}</span>
                                    <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                                </button>
                                {!readOnly && (
                                    <>
                                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label={`Subir ${blockSummary(block)}`} onClick={() => change(shiftBlock(blocks, block.id, -1))}>
                                            <ArrowUp className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label={`Descer ${blockSummary(block)}`} onClick={() => change(shiftBlock(blocks, block.id, 1))}>
                                            <ArrowDown className="h-3.5 w-3.5" />
                                        </Button>
                                    </>
                                )}
                            </li>
                        )
                    })}
                </ol>
            ) : (
                <p className="text-xs text-muted-foreground">A página ainda não tem blocos.</p>
            )}
        </div>
    )
}
