"use client"

import { useRef, type HTMLAttributes } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ArrowLeft, ArrowRight, GripVertical, Inbox, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/features/businesses/format"
import type { BoardColumnView, WorkColumnDto } from "../board"
import { WORK_OTHERS_COLUMN } from "../constants"
import type { WorkSummaryDto } from "../types"
import { ColumnIconView } from "./column-icons"
import { SortableWorkCard } from "./WorkCard"

const VIRTUALIZE_ABOVE = 50
const CARD_ESTIMATE = 150

export const columnSortableId = (key: string) => `col:${key}`
export const columnDropId = (key: string) => `drop:${key}`

export interface ColumnActions {
    onCreateAfter: (afterKey: string) => void
    onEdit: (column: WorkColumnDto) => void
    onDelete: (column: WorkColumnDto) => void
    onShift: (key: string, direction: -1 | 1) => void
}

interface WorkColumnProps {
    column: BoardColumnView
    works: readonly WorkSummaryDto[]
    /** Total na coluna, inclusive arquivados (exclusão só de coluna vazia). */
    rawCount: number
    /** Alguma coisa está sendo arrastada (desliga animações de layout e os "+"). */
    dragActive: boolean
    canShiftLeft: boolean
    canShiftRight: boolean
    movingId: string | null
    /** Quadro do negócio editável (dono, negócio ativo); a visão geral só move entre as fixas. */
    editable: boolean
    overview: boolean
    actions: ColumnActions
    onOpen: (work: WorkSummaryDto) => void
}

/**
 * Coluna do Kanban (padrão `TaskColumn` do Opex). As fixas não têm alça nem menu; as customizadas
 * arrastam pela alça e têm menu (editar, mover, excluir). Na visão geral, "Outras etapas" não recebe
 * cards (mover para uma coluna customizada só dentro do negócio).
 */
export function WorkColumn(props: WorkColumnProps) {
    const { column, works, dragActive, movingId, editable, overview, actions, onOpen } = props
    const model = column.column
    const custom = !model.fixed
    const others = column.key === WORK_OTHERS_COLUMN
    const sortable = useSortable({ id: columnSortableId(column.key), data: { type: "column", key: column.key }, disabled: { draggable: !custom || !editable || overview, droppable: false } })
    const { setNodeRef: setDropRef, isOver } = useDroppable({ id: columnDropId(column.key), data: { type: "zone", key: column.key }, disabled: others || !editable })
    const scrollRef = useRef<HTMLDivElement>(null)
    const virtualize = works.length > VIRTUALIZE_ABOVE
    // eslint-disable-next-line react-hooks/incompatible-library -- padrão do TanStack Virtual (mesmo do Opex)
    const virtualizer = useVirtualizer({ count: works.length, getScrollElement: () => scrollRef.current, estimateSize: () => CARD_ESTIMATE, overscan: 6 })
    const ids = works.map((work) => work.id)
    const currencies = [...new Set(works.map((work) => work.currency))]
    const total = currencies.length === 1 ? works.reduce((sum, work) => sum + (column.key === "paid" && work.payment ? work.payment.receivedCents : work.totalCents), 0) : null

    const card = (work: WorkSummaryDto) => (
        <SortableWorkCard key={work.id} work={work} columnKey={column.key} overview={overview} moving={movingId === work.id} disabled={!editable || work.status === "archived"} layoutEnabled={!dragActive} onOpen={() => onOpen(work)} />
    )

    return (
        <div ref={sortable.setNodeRef} style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }} className="group/insert relative flex shrink-0" data-column={column.key}>
            {sortable.isDragging && <div className="absolute inset-0 rounded-lg border-2 border-dashed border-primary/60 bg-primary/5" aria-hidden />}
            <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: sortable.isDragging ? 0 : 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2 }}
                aria-label={column.label}
                data-status={column.key}
                className={cn("flex w-[290px] max-md:h-[80vh] max-md:w-[85vw] max-md:max-w-[300px] flex-col rounded-lg border border-t-4 bg-muted/40 p-2 transition-colors", column.border, isOver && "bg-primary/10 ring-1 ring-primary/40")}
            >
                <header className="group/col mb-2 flex flex-col gap-1.5 border-b px-1 pb-2">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                            {custom && editable && !overview ? (
                                <button
                                    type="button"
                                    {...(sortable.attributes as HTMLAttributes<HTMLButtonElement>)}
                                    {...(sortable.listeners as HTMLAttributes<HTMLButtonElement>)}
                                    className="-ml-1 cursor-grab rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
                                    aria-label={`Arrastar a coluna ${column.label}`}
                                    title="Arrastar para reorganizar (entre Abertura e Pago)"
                                >
                                    <GripVertical className="h-3.5 w-3.5" aria-hidden />
                                </button>
                            ) : (
                                model.fixed &&
                                !others && (
                                    <span className="-ml-1 p-0.5 text-muted-foreground/60" title="Coluna fixa">
                                        <Lock className="h-3 w-3" aria-label="Coluna fixa" />
                                    </span>
                                )
                            )}
                            <ColumnIconView icon={model.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <h2 className="truncate text-xs font-semibold uppercase tracking-wide" title={column.label}>
                                {column.label}
                            </h2>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <span className="flex items-baseline rounded-sm border bg-background px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums">
                                <AnimatedNumber value={works.length} />
                            </span>
                            {custom && editable && !overview && <ColumnMenu {...props} model={model} />}
                        </div>
                    </div>
                    <div className="flex h-7 items-center gap-2 rounded-md border border-border/60 bg-muted/60 px-1.5" data-testid={`column-meta-${column.key}`}>
                        <div className="min-w-0 flex-1">
                            {model.description && (
                                <Tooltip delayDuration={300}>
                                    <TooltipTrigger asChild>
                                        <p className="truncate text-[10px] leading-tight text-muted-foreground/80" data-testid="column-description">
                                            {model.description}
                                        </p>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" align="start" className="max-w-[260px] whitespace-normal break-words text-xs">
                                        {model.description}
                                    </TooltipContent>
                                </Tooltip>
                            )}
                        </div>
                        {total !== null && works.length > 0 && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatMoney(total, currencies[0]!)}</span>}
                    </div>
                </header>

                <div ref={setDropRef} className="flex min-h-[200px] max-md:min-h-0 flex-1 basis-0 flex-col">
                    <div ref={scrollRef} className="-mr-1 flex min-h-0 flex-1 basis-0 flex-col gap-2 overflow-y-auto pr-1" data-testid={`column-cards-${column.key}`}>
                        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                            {works.length === 0 ? (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col items-center justify-center gap-1 rounded-md border border-dashed py-8 text-center text-[11px] text-muted-foreground">
                                    <Inbox className="h-4 w-4" aria-hidden />
                                    Nenhum trabalho
                                </motion.div>
                            ) : virtualize ? (
                                <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                                    {virtualizer.getVirtualItems().map((item) => {
                                        const work = works[item.index]!
                                        return (
                                            <div key={work.id} ref={virtualizer.measureElement} data-index={item.index} style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)`, paddingBottom: 8 }}>
                                                {card(work)}
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <AnimatePresence initial={false}>{works.map(card)}</AnimatePresence>
                            )}
                        </SortableContext>
                    </div>
                </div>
            </motion.section>

            {!dragActive && editable && !overview && column.key !== "paid" && (
                <div className="absolute -right-3 top-0 z-10 flex h-full w-3 items-start justify-center pt-1.5">
                    <button
                        type="button"
                        onClick={() => actions.onCreateAfter(column.key)}
                        className="flex h-5 w-5 items-center justify-center rounded-full border border-primary/50 bg-card text-primary opacity-0 shadow-sm transition-opacity hover:bg-primary hover:text-primary-foreground focus-visible:opacity-100 group-hover/insert:opacity-100"
                        aria-label={`Nova coluna depois de ${column.label}`}
                        title="Nova coluna aqui"
                    >
                        <Plus className="h-3 w-3" aria-hidden />
                    </button>
                </div>
            )}
        </div>
    )
}

function ColumnMenu({ column, model, rawCount, canShiftLeft, canShiftRight, actions }: WorkColumnProps & { model: WorkColumnDto }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={`Ações da coluna ${column.label}`}>
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => actions.onEdit(model)} className="gap-2">
                    <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canShiftLeft} onSelect={() => actions.onShift(column.key, -1)} className="gap-2">
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Mover para a esquerda
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canShiftRight} onSelect={() => actions.onShift(column.key, 1)} className="gap-2">
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden /> Mover para a direita
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    disabled={rawCount > 0}
                    onSelect={() => actions.onDelete(model)}
                    className="gap-2 text-destructive focus:text-destructive"
                    title={rawCount > 0 ? `Mova os ${rawCount} trabalho(s) antes de excluir (arquivados também contam)` : undefined}
                >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> {rawCount > 0 ? `Excluir (mova os ${rawCount} trabalho(s) antes)` : "Excluir"}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
