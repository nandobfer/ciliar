"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, rectIntersection, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core"
import { AlertTriangle, ChevronDown, Eye, History, LayoutTemplate, Loader2, Monitor, PanelLeft, PanelRight, Redo2, RotateCcw, Smartphone, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { withBasePath } from "@/lib/base-path"
import { cn } from "@/lib/utils"
import { addSectionPick, blockSummary, dropProblem, duplicateBlock, findBlock, insertBlock, locateBlock, moveBlock, newBlock, removeBlock, updateBlock, type BlockTarget, type PortfolioBlock } from "../../blocks"
import { portfolioPreviewPath } from "../../constants"
import { usePortfolioAction } from "../../hooks/usePortfolio"
import { publicFileKind, resolveBlocks, type ResolvedBlock } from "../../resolve"
import { buildTemplate, type PortfolioTemplate } from "../../templates"
import type { PortfolioDto } from "../../types"
import { PortfolioEditorContext, type PortfolioEditorValue } from "./context"
import type { DragData, DropData } from "./dnd"
import { EditorCanvas } from "./EditorCanvas"
import { HistoryDialog, TemplateDialog } from "./EditorDialogs"
import { Inspector } from "./Inspector"
import { LibraryPanel, type LibraryTab } from "./LibraryPanel"
import { useDraftEditor, type SaveStatus } from "./useDraftEditor"

/**
 * Editor de blocos do portfólio (M5), no estilo de um montador: biblioteca à esquerda (blocos,
 * conteúdo e configurações da página), a página real no centro (tema do negócio, edição na página,
 * arrastar e soltar) e as propriedades do bloco à direita. Rascunho salvo sozinho com Desfazer/Refazer;
 * "Publicar alterações" troca a página pública. No celular as barras viram gavetas.
 */

const STATUS_LABEL: Record<SaveStatus, string> = { saved: "Rascunho salvo", pending: "Alterações não salvas", saving: "Salvando...", error: "Falha ao salvar", conflict: "Rascunho alterado em outro lugar" }

/** Ponteiro primeiro (soltar onde o mouse está); com o teclado, a sobreposição dos retângulos. */
const collision: CollisionDetection = (args) => {
    const within = pointerWithin(args)
    return within.length ? within : rectIntersection(args)
}

const isTyping = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false
    const element = target
    return Boolean(element && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) || element.closest("[role=dialog],[role=menu],[role=listbox]")))
}

export function PortfolioEditor({ portfolio }: { portfolio: PortfolioDto }) {
    const editor = useDraftEditor(portfolio)
    const action = usePortfolioAction(portfolio.businessId)
    const readOnly = !portfolio.editable
    const [selected, setSelected] = useState<string | null>(null)
    const [device, setDevice] = useState<"desktop" | "mobile">("desktop")
    const [tab, setTab] = useState<LibraryTab>("blocks")
    const [drawer, setDrawer] = useState<"library" | "inspector" | null>(null)
    const [dragging, setDragging] = useState<DragData | null>(null)
    const [message, setMessage] = useState("")
    const [templateOpen, setTemplateOpen] = useState(false)
    const [historyOpen, setHistoryOpen] = useState(false)
    const [confirm, setConfirm] = useState<"publish" | "discard" | null>(null)
    const [started, setStarted] = useState(false)
    const firstTime = portfolio.needsTemplate && portfolio.editable && !started
    const blocks = editor.blocks

    const fileUrl = useCallback((fileId: string) => withBasePath(`/api/businesses/${portfolio.businessId}/files/${fileId}`), [portfolio.businessId])
    const resolved = useMemo(() => {
        const media = new Map(portfolio.media.map((file) => [file.id, file]))
        const contact = { email: portfolio.business.contactEmail, phone: portfolio.business.contactPhone, whatsappUrl: portfolio.business.whatsappUrl }
        const list = resolveBlocks(blocks, portfolio.pool, media, (file) => ({ ...file, kind: publicFileKind(file.mediaType), viewUrl: fileUrl(file.id), downloadUrl: `${fileUrl(file.id)}?download=1` }), contact)
        const map = new Map<string, ResolvedBlock>()
        for (const block of list) {
            map.set(block.id, block)
            if (block.type === "columns") for (const child of block.columns.flat()) map.set(child.id, child)
        }
        return map
    }, [blocks, portfolio.pool, portfolio.media, portfolio.business, fileUrl])

    const announce = useCallback((text: string) => setMessage(text), [])
    const select = useCallback((id: string | null) => setSelected(id), [])
    const selectedBlock = selected ? findBlock(blocks, selected) : null
    const current = selectedBlock ? selected : null

    /** Depois do selecionado (no mesmo lugar, se couber) ou no fim da página. */
    const targetAfterSelection = useCallback(
        (block: PortfolioBlock): BlockTarget => {
            const at = current ? locateBlock(blocks, current) : null
            if (!at) return { parentId: null, index: blocks.length }
            if (at.parentId) {
                const inside = { parentId: at.parentId, column: at.column ?? 0, index: at.index + 1 }
                if (!dropProblem(blocks, block.type, inside)) return inside
                return { parentId: null, index: (locateBlock(blocks, at.parentId)?.index ?? blocks.length - 1) + 1 }
            }
            return { parentId: null, index: at.index + 1 }
        },
        [blocks, current],
    )

    const insert = useCallback(
        (block: PortfolioBlock, target?: BlockTarget) => {
            const destination = target ?? targetAfterSelection(block)
            const problem = dropProblem(blocks, block.type, destination)
            if (problem) {
                toast.error(problem)
                return
            }
            editor.change(insertBlock(blocks, block, destination))
            setSelected(block.id)
            announce(`${blockSummary(block)} adicionado`)
        },
        [blocks, editor, targetAfterSelection, announce],
    )

    const value: PortfolioEditorValue = { portfolio, blocks, resolved, selected: current, select, change: editor.change, insert, readOnly, fileUrl, announce }

    // Atalhos: desfazer/refazer, excluir, duplicar e Esc (fora dos campos de texto).
    useEffect(() => {
        if (readOnly) return
        const onKeyDown = (event: KeyboardEvent) => {
            const mod = event.ctrlKey || event.metaKey
            if (mod && !event.altKey && event.key.toLowerCase() === "z" && !isTyping(event.target)) {
                event.preventDefault()
                if (event.shiftKey) editor.redo()
                else editor.undo()
                return
            }
            if (mod && !event.altKey && event.key.toLowerCase() === "y" && !isTyping(event.target)) {
                event.preventDefault()
                editor.redo()
                return
            }
            if (isTyping(event.target) || !current) return
            if (event.key === "Delete") {
                event.preventDefault()
                editor.change(removeBlock(blocks, current))
                announce("Bloco excluído (Ctrl+Z desfaz)")
                setSelected(null)
            } else if (mod && event.key.toLowerCase() === "d") {
                event.preventDefault()
                const copy = duplicateBlock(blocks, current)
                if (copy.id) {
                    editor.change(copy.blocks)
                    setSelected(copy.id)
                    announce("Bloco duplicado")
                }
            } else if (event.key === "Escape") setSelected(null)
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [readOnly, editor, blocks, current, announce])

    // Arrastar e soltar.
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] } }))
    const onDragStart = (event: DragStartEvent) => setDragging((event.active.data.current as DragData) ?? null)
    const onDragEnd = (event: DragEndEvent) => {
        setDragging(null)
        const drag = event.active.data.current as DragData | undefined
        const drop = event.over?.data.current as DropData | undefined
        if (!drag || !drop) return
        if (drop.kind === "section") {
            if (drag.kind !== "content") return
            editor.change(updateBlock(blocks, drop.blockId, (block) => (block.type === "section" ? addSectionPick(block, drag.id) : block)))
            setSelected(drop.blockId)
            announce(`${drag.label} adicionado à seção`)
            return
        }
        if (drag.kind === "block") {
            const problem = dropProblem(blocks, drag.type, drop.target, drag.id)
            if (problem) return void toast.error(problem)
            editor.change(moveBlock(blocks, drag.id, drop.target))
            setSelected(drag.id)
            announce(`${drag.label} movido`)
            return
        }
        const created = drag.kind === "new" ? (drag.type === "section" ? newBlock("section", { source: drag.source ?? "successes" }) : newBlock(drag.type)) : drag.kind === "content" ? newBlock("featured", { source: drag.source, refId: drag.id }) : newBlock("image", { mediaId: drag.id, alt: drag.label.replace(/\.[^.]+$/, "") })
        insert(created, drop.target)
        setDrawer(null)
    }

    // Publicar: envia o que faltar e publica a versão salva.
    const publish = async () => {
        const draftVersion = await editor.flush()
        if (draftVersion === null) return void toast.error("Salve o rascunho antes de publicar (veja a situação no topo).")
        action.mutate({ kind: "publishChanges", draftVersion, version: portfolio.version, publishPage: !portfolio.published }, { onSettled: () => setConfirm(null) })
    }
    const discard = async () => {
        const draftVersion = await editor.flush()
        if (draftVersion === null) return
        action.mutate({ kind: "discard", draftVersion }, { onSettled: () => setConfirm(null) })
    }
    const restore = async (number: number) => {
        const draftVersion = await editor.flush()
        if (draftVersion === null) return
        action.mutate({ kind: "restore", number, draftVersion }, { onSuccess: () => setHistoryOpen(false) })
    }
    /** Modelo montado aqui (com Desfazer) com o conteúdo disponível. */
    const applyTemplate = (template: PortfolioTemplate) => {
        const pool = portfolio.pool
        editor.change(
            buildTemplate(template, {
                description: portfolio.business.description,
                counts: { services: pool.services.length, successes: pool.successes.length, documents: pool.documents.length, items: pool.items.length },
                firstSuccessId: pool.successes[0]?.id ?? null,
                hasPhone: Boolean(portfolio.business.whatsappUrl),
            }),
        )
        setTemplateOpen(false)
        setStarted(true)
        setSelected(null)
        announce(template === "blank" ? "Página em branco" : "Modelo aplicado (Ctrl+Z desfaz)")
    }

    const problems = editor.problems
    const canPublishNow = portfolio.canPublish && !problems.length && editor.status !== "conflict" && (editor.hasChanges || !portfolio.published)
    const publishLabel = portfolio.published ? "Publicar alterações" : "Publicar página"
    const library = <LibraryPanel tab={tab} onTabChange={setTab} onInserted={() => setDrawer(null)} />

    return (
        <PortfolioEditorContext.Provider value={value}>
            <DndContext
                sensors={sensors}
                collisionDetection={collision}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragCancel={() => setDragging(null)}
                accessibility={{
                    screenReaderInstructions: { draggable: "Para arrastar, pressione Espaço. Use as setas para mover e Espaço ou Enter para soltar; Esc cancela." },
                    announcements: {
                        onDragStart: ({ active }) => `Arrastando ${(active.data.current as DragData | undefined)?.label ?? "bloco"}.`,
                        onDragOver: ({ over }) => (over ? "Sobre um ponto de soltar." : "Fora de um ponto de soltar."),
                        onDragEnd: ({ over }) => (over ? "Solto." : "Fora de um ponto de soltar: nada mudou."),
                        onDragCancel: () => "Arraste cancelado.",
                    },
                }}
            >
                <div className="flex min-h-[640px] flex-1 flex-col overflow-hidden rounded-xl border bg-card lg:h-[calc(100dvh-12rem)]" data-testid="portfolio-editor">
                    {/* Barra superior */}
                    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
                        <Button type="button" variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir blocos e conteúdo" onClick={() => setDrawer("library")}>
                            <PanelLeft className="h-4 w-4" />
                        </Button>
                        {!readOnly && (
                            <>
                                <Button type="button" variant="ghost" size="icon" aria-label="Desfazer (Ctrl+Z)" title="Desfazer (Ctrl+Z)" disabled={!editor.canUndo} onClick={editor.undo}>
                                    <Undo2 className="h-4 w-4" />
                                </Button>
                                <Button type="button" variant="ghost" size="icon" aria-label="Refazer (Ctrl+Shift+Z)" title="Refazer (Ctrl+Shift+Z)" disabled={!editor.canRedo} onClick={editor.redo}>
                                    <Redo2 className="h-4 w-4" />
                                </Button>
                            </>
                        )}
                        <div className="flex rounded-md border p-0.5" role="group" aria-label="Visualizar como">
                            <Button type="button" variant={device === "desktop" ? "secondary" : "ghost"} size="sm" className="h-7 gap-1 px-2" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>
                                <Monitor className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">Desktop</span>
                            </Button>
                            <Button type="button" variant={device === "mobile" ? "secondary" : "ghost"} size="sm" className="h-7 gap-1 px-2" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}>
                                <Smartphone className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">Celular</span>
                            </Button>
                        </div>
                        <SaveIndicator status={editor.status} error={editor.error} hasChanges={editor.hasChanges} readOnly={readOnly} onRetry={() => void editor.retry()} onReload={() => void editor.reload()} />
                        <div className="ml-auto flex items-center gap-2">
                            {problems.length > 0 && (
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button type="button" variant="outline" size="sm" className="gap-1.5 border-warning/50 text-warning">
                                            <AlertTriangle className="h-4 w-4" aria-hidden /> {problems.length} problema(s)
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 p-2">
                                        <p className="px-1 pb-1 text-xs font-semibold">Corrija para publicar</p>
                                        <ul className="space-y-1">
                                            {problems.map((problem) => (
                                                <li key={`${problem.blockId}-${problem.message}`}>
                                                    <button type="button" className="w-full rounded px-1.5 py-1 text-left text-xs hover:bg-muted" onClick={() => setSelected(problem.blockId)}>
                                                        {problem.message}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </PopoverContent>
                                </Popover>
                            )}
                            <Button asChild variant="outline" size="sm" className="gap-1.5">
                                <a href={withBasePath(portfolioPreviewPath(portfolio.businessId))} target="_blank" rel="noreferrer noopener">
                                    <Eye className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Pré-visualizar</span>
                                </a>
                            </Button>
                            {!readOnly && (
                                <div className="flex">
                                    <Button type="button" size="sm" className="rounded-r-none" disabled={!canPublishNow || action.isPending} title={!portfolio.canPublish ? "Seu perfil não permite publicar (portfolio.publish)" : problems.length ? "Corrija os problemas para publicar" : undefined} onClick={() => setConfirm("publish")}>
                                        {action.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />}
                                        {publishLabel}
                                    </Button>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button type="button" size="sm" className="rounded-l-none border-l border-primary-foreground/20 px-2" aria-label="Mais ações da página">
                                                <ChevronDown className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onSelect={() => setTemplateOpen(true)}>
                                                <LayoutTemplate className="mr-2 h-4 w-4" aria-hidden /> Aplicar modelo...
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
                                                <History className="mr-2 h-4 w-4" aria-hidden /> Histórico de publicações...
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem disabled={!editor.hasChanges || portfolio.live.number === 0} onSelect={() => setConfirm("discard")} className="text-destructive">
                                                <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Descartar rascunho
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            )}
                            {readOnly && (
                                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setHistoryOpen(true)}>
                                    <History className="h-4 w-4" aria-hidden /> Histórico
                                </Button>
                            )}
                            <Button type="button" variant="ghost" size="icon" className="xl:hidden" aria-label="Abrir propriedades" onClick={() => setDrawer("inspector")}>
                                <PanelRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="flex min-h-0 flex-1">
                        <aside className="hidden w-72 shrink-0 flex-col border-r lg:flex" aria-label="Blocos, conteúdo e página">
                            {library}
                        </aside>
                        <main className="min-w-0 flex-1 overflow-y-auto bg-muted/30 p-3 @container md:p-6" aria-label="Página do portfólio">
                            {readOnly && <p className="mx-auto mb-3 max-w-5xl rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">Somente leitura{portfolio.businessStatus === "archived" ? ": negócio arquivado" : ""}.</p>}
                            <EditorCanvas device={device} />
                        </main>
                        <aside className="hidden w-80 shrink-0 flex-col border-l xl:flex" aria-label="Propriedades">
                            <Inspector />
                        </aside>
                    </div>
                </div>

                <Sheet open={drawer === "library"} onOpenChange={(open) => setDrawer(open ? "library" : null)}>
                    <SheetContent side="left" className="flex w-[85vw] flex-col p-0 sm:max-w-sm">
                        <SheetHeader className="px-4 pt-4">
                            <SheetTitle>Blocos e conteúdo</SheetTitle>
                            <SheetDescription>Toque para inserir depois do bloco selecionado.</SheetDescription>
                        </SheetHeader>
                        {library}
                    </SheetContent>
                </Sheet>
                <Sheet open={drawer === "inspector"} onOpenChange={(open) => setDrawer(open ? "inspector" : null)}>
                    <SheetContent side="right" className="flex w-[85vw] flex-col p-0 sm:max-w-sm">
                        <SheetHeader className="px-4 pt-4">
                            <SheetTitle>Propriedades</SheetTitle>
                            <SheetDescription>{selectedBlock ? blockSummary(selectedBlock) : "Blocos da página"}</SheetDescription>
                        </SheetHeader>
                        <Inspector />
                    </SheetContent>
                </Sheet>

                <DragOverlay dropAnimation={null}>{dragging ? <div className="rounded-md border bg-popover px-3 py-1.5 text-sm font-medium text-popover-foreground shadow-lg">{dragging.label}</div> : null}</DragOverlay>
            </DndContext>

            <p className="sr-only" role="status" aria-live="polite">
                {message}
            </p>

            <TemplateDialog
                open={templateOpen || firstTime}
                onOpenChange={(open) => {
                    if (!open && firstTime) applyTemplate("blank")
                    else setTemplateOpen(open)
                }}
                firstTime={firstTime}
                pending={false}
                onApply={applyTemplate}
            />
            <HistoryDialog businessId={portfolio.businessId} open={historyOpen} onOpenChange={setHistoryOpen} pending={action.isPending} onRestore={(number) => void restore(number)} readOnly={readOnly} />
            <ConfirmDialog
                open={confirm === "publish"}
                onOpenChange={(open) => !open && setConfirm(null)}
                title={portfolio.published ? "Publicar as alterações?" : "Publicar a página?"}
                description={portfolio.published ? "O rascunho passa a ser a página pública. A versão atual fica no histórico." : "A página fica pública, sem login, com estes blocos. Valores, clientes (fora os nomes autorizados), pedidos e trabalhos nunca aparecem."}
                confirmLabel={publishLabel}
                pending={action.isPending}
                onConfirm={() => void publish()}
            />
            <ConfirmDialog
                open={confirm === "discard"}
                onOpenChange={(open) => !open && setConfirm(null)}
                title="Descartar o rascunho?"
                description="As alterações não publicadas se perdem e o rascunho volta a ser igual à página publicada."
                confirmLabel="Descartar"
                variant="destructive"
                pending={action.isPending}
                onConfirm={() => void discard()}
            />
        </PortfolioEditorContext.Provider>
    )
}

function SaveIndicator({ status, error, hasChanges, readOnly, onRetry, onReload }: { status: SaveStatus; error: string | null; hasChanges: boolean; readOnly: boolean; onRetry: () => void; onReload: () => void }) {
    if (readOnly) return null
    return (
        <p role="status" className={cn("flex items-center gap-1.5 text-xs", status === "error" || status === "conflict" ? "text-destructive" : "text-muted-foreground")}>
            {status === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            <span title={error ?? undefined}>{STATUS_LABEL[status]}</span>
            {status === "saved" && hasChanges && <span className="hidden text-muted-foreground md:inline">· alterações não publicadas</span>}
            {status === "error" && (
                <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onRetry}>
                    Tentar de novo
                </Button>
            )}
            {status === "conflict" && (
                <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onReload}>
                    Recarregar
                </Button>
            )}
        </p>
    )
}

