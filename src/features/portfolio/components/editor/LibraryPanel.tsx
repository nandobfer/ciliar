"use client"

import { useMemo, useState } from "react"
import { useDraggable } from "@dnd-kit/core"
import { GalleryHorizontalEnd, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { normalizeText } from "@/lib/text"
import { cn } from "@/lib/utils"
import { BLOCK_DESCRIPTIONS, BLOCK_LABELS, newBlock, SOURCE_LABELS, type PortfolioBlockType } from "../../blocks"
import { PORTFOLIO_SECTION_KEYS, type PortfolioSectionKey } from "../../constants"
import { PortfolioItemDialog, PortfolioItemsTab } from "../PortfolioItemsTab"
import { BLOCK_ICONS } from "./block-icons"
import { usePortfolioEditor } from "./context"
import type { DragData } from "./dnd"
import { MediaLibrary } from "./MediaLibrary"
import { PagePanel } from "./PagePanel"

/**
 * Barra esquerda do editor: Blocos (estrutura e seções), Conteúdo (sucessos, serviços, documentos,
 * itens avulsos e a mídia, para arrastar ou clicar e inserir) e Página (publicação e configurações).
 */

export type LibraryTab = "blocks" | "content" | "page"

const STRUCTURE: PortfolioBlockType[] = ["heading", "text", "image", "gallery", "button", "testimonial", "separator", "columns"]

export function LibraryPanel({ tab, onTabChange, onInserted }: { tab: LibraryTab; onTabChange: (tab: LibraryTab) => void; onInserted?: () => void }) {
    return (
        <Tabs value={tab} onValueChange={(value) => onTabChange(value as LibraryTab)} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-3 mt-3 grid grid-cols-3">
                <TabsTrigger value="blocks">Blocos</TabsTrigger>
                <TabsTrigger value="content">Conteúdo</TabsTrigger>
                <TabsTrigger value="page">Página</TabsTrigger>
            </TabsList>
            <TabsContent value="blocks" className="min-h-0 flex-1 overflow-y-auto p-3">
                <BlocksTab onInserted={onInserted} />
            </TabsContent>
            <TabsContent value="content" className="min-h-0 flex-1 overflow-y-auto p-3">
                <ContentTab onInserted={onInserted} />
            </TabsContent>
            <TabsContent value="page" className="min-h-0 flex-1 overflow-y-auto p-3">
                <PagePanel />
            </TabsContent>
        </Tabs>
    )
}

function BlocksTab({ onInserted }: { onInserted?: () => void }) {
    const { insert } = usePortfolioEditor()
    return (
        <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Arraste para a página ou clique para inserir depois do bloco selecionado.</p>
            <div className="space-y-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estrutura</h3>
                <ul className="grid grid-cols-2 gap-1.5">
                    {STRUCTURE.map((type) => (
                        <LibraryTile key={type} data={{ kind: "new", type, label: BLOCK_LABELS[type] }} icon={BLOCK_ICONS[type]} title={BLOCK_LABELS[type]} description={BLOCK_DESCRIPTIONS[type]} onActivate={() => { insert(newBlock(type)); onInserted?.() }} />
                    ))}
                </ul>
            </div>
            <div className="space-y-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seções de conteúdo</h3>
                <ul className="grid grid-cols-2 gap-1.5">
                    {PORTFOLIO_SECTION_KEYS.map((source) => (
                        <LibraryTile
                            key={source}
                            data={{ kind: "new", type: "section", source, label: SOURCE_LABELS[source].many }}
                            icon={BLOCK_ICONS.section}
                            title={SOURCE_LABELS[source].many}
                            description={`Lista de ${SOURCE_LABELS[source].many.toLowerCase()} (escolhidos ou todos)`}
                            onActivate={() => { insert(newBlock("section", { source })); onInserted?.() }}
                        />
                    ))}
                </ul>
            </div>
        </div>
    )
}

function ContentTab({ onInserted }: { onInserted?: () => void }) {
    const { portfolio, insert, readOnly } = usePortfolioEditor()
    const [query, setQuery] = useState("")
    const [itemDialog, setItemDialog] = useState(false)
    const [manage, setManage] = useState(false)
    const pool = portfolio.pool
    const groups = useMemo(() => {
        const term = normalizeText(query.trim())
        const match = (...values: (string | null | undefined)[]) => !term || values.some((value) => value && normalizeText(value).includes(term))
        return {
            successes: pool.successes.filter((entry) => match(entry.title, entry.result, entry.clientName)).map((entry) => ({ id: entry.id, label: entry.title, detail: entry.result })),
            services: pool.services.filter((entry) => match(entry.name, entry.description)).map((entry) => ({ id: entry.id, label: entry.name, detail: null })),
            documents: pool.documents.filter((entry) => match(entry.name, entry.description)).map((entry) => ({ id: entry.id, label: entry.name, detail: entry.file.name })),
            items: pool.items.filter((entry) => match(entry.title, entry.description, ...entry.tags)).map((entry) => ({ id: entry.id, label: entry.title, detail: entry.tags.join(", ") || null })),
        } satisfies Record<PortfolioSectionKey, { id: string; label: string; detail: string | null }[]>
    }, [pool, query])
    const order: PortfolioSectionKey[] = ["successes", "items", "services", "documents"]

    return (
        <div className="space-y-4">
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conteúdo" aria-label="Buscar conteúdo do negócio" className="pl-8" />
            </div>
            <p className="text-xs text-muted-foreground">Arraste entre os blocos para criar um destaque, ou para dentro de uma seção do mesmo tipo.</p>
            {order.map((source) => (
                <div key={source} className="space-y-1.5">
                    <h3 className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {SOURCE_LABELS[source].many}
                        <span className="font-normal normal-case">{groups[source].length}</span>
                    </h3>
                    {groups[source].length ? (
                        <ul className="space-y-1">
                            {groups[source].map((entry) => (
                                <LibraryRow
                                    key={entry.id}
                                    data={{ kind: "content", source, id: entry.id, label: entry.label }}
                                    title={entry.label}
                                    detail={entry.detail}
                                    onActivate={() => { insert(newBlock("featured", { source, refId: entry.id })); onInserted?.() }}
                                />
                            ))}
                        </ul>
                    ) : (
                        <p className="text-xs text-muted-foreground">Nada disponível.</p>
                    )}
                    {portfolio.unavailable[source] > 0 && <p className="text-[11px] text-muted-foreground">{portfolio.unavailable[source]} arquivado(s), desmarcado(s) ou inativo(s) não aparecem.</p>}
                    {source === "items" && !readOnly && (
                        <div className="flex flex-wrap gap-1">
                            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setItemDialog(true)}>
                                <Plus className="h-3.5 w-3.5" aria-hidden /> Novo item avulso
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setManage(true)}>
                                <GalleryHorizontalEnd className="h-3.5 w-3.5" aria-hidden /> Gerenciar
                            </Button>
                        </div>
                    )}
                </div>
            ))}
            <div className="space-y-1.5 border-t pt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mídia</h3>
                <MediaLibrary draggable onInsert={(media) => (insert(newBlock("image", { mediaId: media.id, alt: media.name.replace(/\.[^.]+$/, "") })), onInserted?.())} />
            </div>
            {itemDialog && <PortfolioItemDialog item={null} onClose={() => setItemDialog(false)} />}
            <Dialog open={manage} onOpenChange={setManage}>
                <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Itens avulsos do portfólio</DialogTitle>
                        <DialogDescription>Projetos só para o portfólio. Arquivados saem da página e são excluídos depois do prazo da Plataforma.</DialogDescription>
                    </DialogHeader>
                    <PortfolioItemsTab />
                </DialogContent>
            </Dialog>
        </div>
    )
}

// @dnd-kit v6 devolve propriedades de render junto de setNodeRef; não lemos ref.current aqui.
/* eslint-disable react-hooks/refs */
function LibraryTile({ data, icon: Icon, title, description, onActivate }: { data: DragData; icon: (typeof BLOCK_ICONS)[PortfolioBlockType]; title: string; description: string; onActivate: () => void }) {
    const { readOnly } = usePortfolioEditor()
    const drag = useDraggable({ id: `lib:${data.kind}:${data.kind === "new" ? `${data.type}:${data.source ?? ""}` : ""}`, data, disabled: readOnly })
    return (
        <li>
            <button
                ref={drag.setNodeRef}
                type="button"
                disabled={readOnly}
                title={description}
                {...drag.attributes}
                {...drag.listeners}
                onClick={onActivate}
                className={cn("flex w-full flex-col items-center gap-1 rounded-lg border bg-background p-2.5 text-center text-xs font-medium transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none", !readOnly && "cursor-grab", drag.isDragging && "opacity-40")}
            >
                <Icon className="h-5 w-5 text-primary" aria-hidden />
                {title}
                <span className="sr-only">: {description}</span>
            </button>
        </li>
    )
}

function LibraryRow({ data, title, detail, onActivate }: { data: DragData; title: string; detail: string | null; onActivate: () => void }) {
    const { readOnly } = usePortfolioEditor()
    const drag = useDraggable({ id: `lib:${data.kind}:${data.kind === "content" ? `${data.source}:${data.id}` : ""}`, data, disabled: readOnly })
    return (
        <li>
            <button
                ref={drag.setNodeRef}
                type="button"
                disabled={readOnly}
                {...drag.attributes}
                {...drag.listeners}
                onClick={onActivate}
                aria-label={`Inserir em destaque: ${title}`}
                className={cn("w-full rounded-md border bg-background px-2.5 py-1.5 text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 motion-reduce:transition-none", !readOnly && "cursor-grab", drag.isDragging && "opacity-40")}
            >
                <span className="block truncate text-sm">{title}</span>
                {detail && <span className="block truncate text-[11px] text-muted-foreground">{detail}</span>}
            </button>
        </li>
    )
}
/* eslint-enable react-hooks/refs */
