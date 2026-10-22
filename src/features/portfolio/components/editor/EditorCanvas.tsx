"use client"

import { useState, type KeyboardEvent, type ReactNode } from "react"
import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core"
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MarkdownField } from "@/components/ui/markdown-field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
    BLOCK_LABELS,
    BLOCK_TYPES,
    blockSummary,
    dropProblem,
    duplicateBlock,
    newBlock,
    removeBlock,
    shiftBlock,
    SIMPLE_BLOCK_TYPES,
    updateBlock,
    type BlockTarget,
    type PortfolioBlock,
    type PortfolioBlockType,
} from "../../blocks"
import { PORTFOLIO_SECTION_KEYS } from "../../constants"
import { SOURCE_LABELS } from "../../blocks"
import type { ResolvedBlock, ResolvedSimpleBlock } from "../../resolve"
import { blockStyleClass, COLUMN_GRID, PortfolioContactView, PortfolioHeaderView, SectionBody, SimpleBlockBody } from "../BlocksView"
import { usePortfolioEditor } from "./context"
import { dragBlockType, slotId, type DragData, type DropData } from "./dnd"
import { BLOCK_ICONS } from "./block-icons"

/**
 * Página no editor (centro): a renderização pública com contorno ao passar o mouse, seleção por
 * clique ou teclado, barra do bloco selecionado (arrastar, ↑/↓, duplicar, excluir), pontos de
 * soltar entre os blocos durante o arraste e "+" para inserir. Título e texto editados na página.
 */

export function EditorCanvas({ device }: { device: "desktop" | "mobile" }) {
    const { portfolio, blocks, select, readOnly } = usePortfolioEditor()
    return (
        <div
            className={cn("mx-auto transition-[max-width] motion-reduce:transition-none", device === "mobile" ? "max-w-[390px]" : "max-w-5xl")}
            onClick={() => select(null)}
            // Links da página não navegam dentro do editor.
            onClickCapture={(event) => {
                if ((event.target as HTMLElement).closest("a")) event.preventDefault()
            }}
        >
            <div className="@container flex flex-col gap-6 rounded-xl border bg-background p-4 text-foreground shadow-sm @3xl:p-8">
                <div className="relative rounded-lg border border-dashed border-transparent p-1 hover:border-border">
                    <span className="absolute -top-2.5 right-2 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">Fixo · vem da Ficha</span>
                    <PortfolioHeaderView business={portfolio.business} />
                </div>
                <BlockList parentId={null} column={0} blocks={blocks} />
                {!blocks.length && !readOnly && <p className="text-center text-sm text-muted-foreground">Arraste blocos ou conteúdos da barra lateral para cá, ou use o &quot;+&quot;.</p>}
                <div className="relative rounded-lg border border-dashed border-transparent p-1 hover:border-border">
                    <span className="absolute -top-2.5 right-2 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">Fixo · vem da Ficha</span>
                    <PortfolioContactView business={portfolio.business} />
                </div>
            </div>
        </div>
    )
}

function BlockList({ parentId, column, blocks }: { parentId: string | null; column: number; blocks: readonly PortfolioBlock[] }) {
    const { readOnly } = usePortfolioEditor()
    return (
        <div className={cn("flex flex-col", parentId ? "min-h-12 gap-1" : "gap-1")}>
            {blocks.map((block, index) => (
                <div key={block.id} className="flex flex-col gap-1">
                    {!readOnly && <DropSlot target={{ parentId, column, index }} />}
                    {!readOnly && <InsertPoint target={{ parentId, column, index }} compact />}
                    <EditableBlock block={block} />
                </div>
            ))}
            {!readOnly && <DropSlot target={{ parentId, column, index: blocks.length }} />}
            {!readOnly && <InsertPoint target={{ parentId, column, index: blocks.length }} />}
        </div>
    )
}

/** Ponto de soltar: só aparece durante um arraste que pode cair ali. */
function DropSlot({ target }: { target: BlockTarget }) {
    const { blocks } = usePortfolioEditor()
    const { active } = useDndContext()
    const drag = active?.data.current as DragData | undefined
    const allowed = Boolean(drag) && !dropProblem(blocks, dragBlockType(drag!), target, drag?.kind === "block" ? drag.id : undefined) && !(drag?.kind === "block" && target.parentId === drag.id)
    const { setNodeRef, isOver } = useDroppable({ id: slotId(target), data: { kind: "slot", target } satisfies DropData, disabled: !allowed })
    if (!allowed) return null
    return (
        <div ref={setNodeRef} aria-hidden className={cn("flex items-center rounded-md border-2 border-dashed transition-all motion-reduce:transition-none", isOver ? "h-12 border-primary bg-primary/10" : "h-4 border-primary/30")}>
            {isOver && <span className="w-full text-center text-xs font-medium text-primary">Soltar aqui</span>}
        </div>
    )
}

/** "+" entre os blocos: escolhe o tipo e insere na posição. */
function InsertPoint({ target, compact = false }: { target: BlockTarget; compact?: boolean }) {
    const { insert, blocks } = usePortfolioEditor()
    const { active } = useDndContext()
    const [open, setOpen] = useState(false)
    if (active) return null
    const types = (target.parentId ? SIMPLE_BLOCK_TYPES : BLOCK_TYPES).filter((type) => type !== "featured" && type !== "section")
    const add = (type: PortfolioBlockType, source?: (typeof PORTFOLIO_SECTION_KEYS)[number]) => {
        setOpen(false)
        insert(type === "section" ? newBlock("section", { source }) : newBlock(type), target)
    }
    const blocked = dropProblem(blocks, "heading", target)
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <div className={cn("group/insert relative flex justify-center", compact ? "h-2" : "h-8")}>
                {compact && <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-primary/0 transition-colors group-hover/insert:bg-primary/40 group-focus-within/insert:bg-primary/40" />}
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        size={compact ? "icon" : "sm"}
                        disabled={Boolean(blocked)}
                        title={blocked ?? "Adicionar bloco aqui"}
                        aria-label={target.parentId ? `Adicionar bloco na coluna ${(target.column ?? 0) + 1}, posição ${target.index + 1}` : `Adicionar bloco na posição ${target.index + 1}`}
                        onClick={(event) => event.stopPropagation()}
                        className={cn("relative z-10 gap-1.5 bg-background", compact && "h-6 w-6 -translate-y-2 rounded-full opacity-0 focus-visible:opacity-100 group-hover/insert:opacity-100", !compact && "border-dashed text-muted-foreground")}
                    >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        {!compact && "Adicionar bloco"}
                    </Button>
                </PopoverTrigger>
            </div>
            <PopoverContent className="w-72 p-2" onClick={(event) => event.stopPropagation()}>
                <p className="px-2 pb-1 text-xs font-semibold text-muted-foreground">Blocos</p>
                <div className="grid grid-cols-2 gap-1">
                    {types.map((type) => {
                        const Icon = BLOCK_ICONS[type]
                        return (
                            <Button key={type} type="button" variant="ghost" size="sm" className="justify-start gap-2" onClick={() => add(type)}>
                                <Icon className="h-4 w-4 text-primary" aria-hidden /> {BLOCK_LABELS[type]}
                            </Button>
                        )
                    })}
                </div>
                {!target.parentId && (
                    <>
                        <p className="px-2 pb-1 pt-2 text-xs font-semibold text-muted-foreground">Seções de conteúdo</p>
                        <div className="grid grid-cols-2 gap-1">
                            {PORTFOLIO_SECTION_KEYS.map((source) => {
                                const Icon = BLOCK_ICONS.section
                                return (
                                    <Button key={source} type="button" variant="ghost" size="sm" className="justify-start gap-2" onClick={() => add("section", source)}>
                                        <Icon className="h-4 w-4 text-primary" aria-hidden /> {SOURCE_LABELS[source].many}
                                    </Button>
                                )
                            })}
                        </div>
                    </>
                )}
            </PopoverContent>
        </Popover>
    )
}

// @dnd-kit v6 devolve propriedades de render junto de setNodeRef; não lemos ref.current aqui.
/* eslint-disable react-hooks/refs */
function EditableBlock({ block }: { block: PortfolioBlock }) {
    const { blocks, resolved, selected, select, change, readOnly, announce } = usePortfolioEditor()
    const isSelected = selected === block.id
    const label = blockSummary(block)
    const drag = useDraggable({ id: `block:${block.id}`, data: { kind: "block", id: block.id, type: block.type, label } satisfies DragData, disabled: readOnly })
    const view = resolved.get(block.id)
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            select(block.id)
        }
    }
    const act = (next: PortfolioBlock[], message: string) => {
        change(next)
        announce(message)
    }

    return (
        <div
            ref={drag.setNodeRef}
            role="group"
            tabIndex={0}
            aria-label={`${label}${isSelected ? " (selecionado)" : ""}`}
            aria-current={isSelected || undefined}
            data-block-id={block.id}
            onClick={(event) => {
                event.stopPropagation()
                select(block.id)
            }}
            onKeyDown={onKeyDown}
            className={cn(
                "group/block relative rounded-lg outline-offset-2 transition-[outline-color,opacity] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-ring",
                isSelected ? "outline-2 outline-primary [outline-style:solid]" : "outline-1 outline-transparent [outline-style:dashed] hover:outline-primary/50",
                drag.isDragging && "opacity-40",
            )}
        >
            {isSelected && !readOnly && (
                <div className="absolute -top-4 right-2 z-20 flex items-center gap-0.5 rounded-md border bg-popover p-0.5 text-popover-foreground shadow-md" onClick={(event) => event.stopPropagation()}>
                    <span className="px-1.5 text-[11px] font-semibold text-muted-foreground">{BLOCK_LABELS[block.type]}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 cursor-grab active:cursor-grabbing" aria-label={`Arrastar ${label}`} {...drag.attributes} {...drag.listeners}>
                        <GripVertical className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Subir bloco" onClick={() => act(shiftBlock(blocks, block.id, -1), `${label} subiu`)}>
                        <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Descer bloco" onClick={() => act(shiftBlock(blocks, block.id, 1), `${label} desceu`)}>
                        <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Duplicar bloco"
                        onClick={() => {
                            const copy = duplicateBlock(blocks, block.id)
                            if (!copy.id) return announce("Limite de blocos atingido")
                            act(copy.blocks, `${label} duplicado`)
                            select(copy.id)
                        }}
                    >
                        <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        aria-label="Excluir bloco"
                        onClick={() => {
                            act(removeBlock(blocks, block.id), `${label} excluído (Ctrl+Z desfaz)`)
                            select(null)
                        }}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            )}
            <div className={blockStyleClass(block.style)}>
                <BlockContent block={block} view={view} editing={isSelected && !readOnly} />
            </div>
        </div>
    )
}
/* eslint-enable react-hooks/refs */

function BlockContent({ block, view, editing }: { block: PortfolioBlock; view: ResolvedBlock | undefined; editing: boolean }): ReactNode {
    const { blocks, change } = usePortfolioEditor()
    if (block.type === "columns") {
        return (
            <div className={cn("grid gap-4", COLUMN_GRID[block.ratio])}>
                {block.columns.map((children, column) => (
                    <div key={column} className="min-w-0 rounded-md border border-dashed border-border/60 p-1" aria-label={`Coluna ${column + 1}`}>
                        <BlockList parentId={block.id} column={column} blocks={children} />
                    </div>
                ))}
            </div>
        )
    }
    if (block.type === "section") return <SectionDrop block={block}>{view?.type === "section" ? <SectionBody block={view} editor /> : null}</SectionDrop>
    if (editing && block.type === "heading") {
        return (
            <textarea
                aria-label="Texto do título"
                value={block.text}
                rows={1}
                maxLength={200}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => change(updateBlock(blocks, block.id, (current) => ({ ...current, text: event.target.value.replace(/\n/g, " ") }) as PortfolioBlock), `${block.id}:text`)}
                className={cn("field-sizing-content w-full resize-none rounded-md bg-transparent font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring", block.level === 2 ? "text-2xl @3xl:text-3xl" : "text-xl", block.style.align === "center" && "text-center")}
                placeholder="Título"
            />
        )
    }
    if (editing && block.type === "text") {
        return (
            <div onClick={(event) => event.stopPropagation()} className="text-left">
                <MarkdownField
                    value={block.markdown}
                    rows={6}
                    tools={["bold", "italic", "link", "list"]}
                    ariaLabel="Texto do bloco"
                    tablistLabel="Escrever ou visualizar o texto"
                    placeholder="Escreva aqui. **negrito**, _itálico_, [link](https://…) e listas com -"
                    onChange={(markdown) => change(updateBlock(blocks, block.id, (current) => ({ ...current, markdown: markdown.slice(0, 5000) }) as PortfolioBlock), `${block.id}:markdown`)}
                />
            </div>
        )
    }
    if (view && view.type !== "section" && view.type !== "columns") return <SimpleBlockBody block={view as ResolvedSimpleBlock} editor />
    return null
}

/** Seção como destino: conteúdos da mesma fonte entram na lista dela. */
function SectionDrop({ block, children }: { block: Extract<PortfolioBlock, { type: "section" }>; children: ReactNode }) {
    const { active } = useDndContext()
    const drag = active?.data.current as DragData | undefined
    const accepts = drag?.kind === "content" && drag.source === block.source
    const { setNodeRef, isOver } = useDroppable({ id: `section:${block.id}`, data: { kind: "section", blockId: block.id, source: block.source } satisfies DropData, disabled: !accepts })
    return (
        <div ref={setNodeRef} className={cn("relative rounded-lg", accepts && "outline-2 outline-offset-4 outline-dashed outline-primary/40", isOver && "bg-primary/5 outline-primary")}>
            {accepts && <span className="absolute -top-3 left-3 z-10 rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">Solte para adicionar à seção</span>}
            {children}
        </div>
    )
}
