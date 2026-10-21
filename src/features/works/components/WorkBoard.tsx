"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
    closestCenter,
    DndContext,
    DragOverlay,
    KeyboardSensor,
    MouseSensor,
    pointerWithin,
    rectIntersection,
    TouchSensor,
    useSensor,
    useSensors,
    type CollisionDetection,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent,
} from "@dnd-kit/core"
import { arrayMove, horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { Plus } from "lucide-react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { CONTENT_BLEED_X } from "@/features/layout/content-padding"
import { boardColumnOf, type BoardColumnView } from "../board"
import { WORK_OTHERS_COLUMN, type WorkSortKey } from "../constants"
import { finalDropPosition, moveBetweenColumns, type ColumnItems } from "../drop-target"
import { sortWorks } from "../logic"
import type { WorkSummaryDto } from "../types"
import { ColumnIconView } from "./column-icons"
import { WorkCardView } from "./WorkCard"
import { columnSortableId, WorkColumn, type ColumnActions } from "./WorkColumn"

interface WorkBoardProps {
    works: readonly WorkSummaryDto[]
    /** Colunas na ordem do quadro (negócio) ou as fixas + "Outras etapas" (visão geral). */
    columns: readonly BoardColumnView[]
    /** Total por coluna, inclusive arquivados (exclusão só de coluna vazia). */
    rawCounts: Readonly<Record<string, number>>
    sort: WorkSortKey
    overview: boolean
    editable: boolean
    movingId: string | null
    actions: ColumnActions
    /** Soltou o card numa coluna (o fluxo decide: mover, pagamento ou confirmação de saída de Pago). */
    onMove: (work: WorkSummaryDto, column: string, position?: number) => void
    /** Nova ordem das colunas (só o quadro do negócio). */
    onReorderColumns: (order: string[]) => void
    onOpen: (work: WorkSummaryDto) => void
}

/** Quanto tempo a posição do arraste segura a tela esperando a resposta otimista. */
const SETTLE_MS = 1500

/**
 * Kanban com dnd-kit em vários contêineres (cópia do `TaskBoard` do Opex): o card entra na coluna de
 * destino durante o arraste e as colunas customizadas arrastam pela alça. Movimento livre entre
 * colunas, por mouse, toque ou teclado (espaço para pegar, setas para mover, espaço para soltar).
 */
export function WorkBoard({ works, columns, rawCounts, sort, overview, editable, movingId, actions, onMove, onReorderColumns, onOpen }: WorkBoardProps) {
    const [activeWork, setActiveWork] = useState<WorkSummaryDto | null>(null)
    const [activeColumn, setActiveColumn] = useState<BoardColumnView | null>(null)
    const [dragItems, setDragItems] = useState<ColumnItems | null>(null)
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    )

    const byId = useMemo(() => new Map(works.map((work) => [work.id, work])), [works])
    const baseItems = useMemo<ColumnItems>(() => {
        const grouped: Record<string, WorkSummaryDto[]> = {}
        for (const column of columns) grouped[column.key] = []
        for (const work of works) grouped[boardColumnOf(work, overview)]?.push(work)
        const result: Record<string, string[]> = {}
        for (const column of columns) result[column.key] = sortWorks(grouped[column.key]!, sort).map((work) => work.id)
        return result
    }, [works, columns, sort, overview])

    const settling = useRef(false)
    useEffect(() => {
        if (!settling.current) return
        settling.current = false
        setDragItems(null)
    }, [baseItems])
    useEffect(() => {
        if (!dragItems || activeWork) return
        const timer = setTimeout(() => setDragItems(null), SETTLE_MS)
        return () => clearTimeout(timer)
    }, [dragItems, activeWork])

    const items = dragItems ?? baseItems
    const itemsRef = useRef(items)
    useEffect(() => {
        itemsRef.current = items
    }, [items])

    const containerOf = useCallback((id: string): string | null => {
        if (id.startsWith("drop:")) return id.slice(5)
        if (id.startsWith("col:")) return id.slice(4)
        for (const [key, ids] of Object.entries(itemsRef.current)) if (ids.includes(id)) return key
        return null
    }, [])

    const collisionDetection: CollisionDetection = useCallback((args) => {
        if (String(args.active.id).startsWith("col:")) {
            return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((container) => String(container.id).startsWith("col:")) })
        }
        const containers = args.droppableContainers.filter((container) => !String(container.id).startsWith("col:"))
        const pointer = pointerWithin({ ...args, droppableContainers: containers })
        const hits = pointer.length ? pointer : rectIntersection({ ...args, droppableContainers: containers })
        const zone = hits.find((hit) => String(hit.id).startsWith("drop:"))
        if (!zone) return hits
        const ids = itemsRef.current[String(zone.id).slice(5)] ?? []
        const cards = containers.filter((container) => ids.includes(String(container.id)))
        return cards.length ? closestCenter({ ...args, droppableContainers: cards }) : [zone]
    }, [])

    const reset = () => {
        setActiveWork(null)
        setActiveColumn(null)
    }

    const onDragStart = ({ active }: DragStartEvent) => {
        const id = String(active.id)
        if (id.startsWith("col:")) {
            setActiveColumn(columns.find((column) => columnSortableId(column.key) === id) ?? null)
            return
        }
        setActiveWork(byId.get(id) ?? null)
        setDragItems(baseItems)
    }

    const onDragOver = ({ active, over }: DragOverEvent) => {
        if (!over || !activeWork || String(active.id).startsWith("col:")) return
        const from = containerOf(String(active.id))
        const to = containerOf(String(over.id))
        // "Outras etapas" (visão geral) não recebe cards.
        if (!from || !to || from === to || to === WORK_OTHERS_COLUMN) return
        const translated = active.rect.current.translated
        const below = Boolean(translated && translated.top > over.rect.top + over.rect.height / 2)
        setDragItems((prev) => moveBetweenColumns(prev ?? baseItems, String(active.id), from, to, String(over.id), below))
    }

    const onDragEnd = ({ active, over }: DragEndEvent) => {
        const id = String(active.id)
        if (id.startsWith("col:")) {
            reset()
            if (!over || over.id === active.id) return
            const keys = columns.map((column) => columnSortableId(column.key))
            const from = keys.indexOf(id)
            const to = keys.indexOf(String(over.id))
            // As customizadas ficam entre Abertura (primeira) e Pago (última).
            if (from !== -1 && to > 0 && to < keys.length - 1) onReorderColumns(arrayMove(columns.map((column) => column.key), from, to))
            return
        }

        const dragged = activeWork
        const current = dragItems ?? baseItems
        reset()
        if (!over || !dragged) {
            setDragItems(null)
            return
        }
        const target = containerOf(String(over.id))
        const origin = boardColumnOf(dragged, overview)
        if (!target || (target === WORK_OTHERS_COLUMN && origin !== WORK_OTHERS_COLUMN)) {
            setDragItems(null)
            return
        }
        const result = finalDropPosition(current, baseItems, dragged, origin, target, String(over.id), sort, (other) => byId.get(other)?.position ?? 0)
        if (!result || target === WORK_OTHERS_COLUMN) {
            setDragItems(null)
            return
        }
        settling.current = true
        setDragItems(result.items)
        onMove(dragged, target, result.position)
    }

    const onDragCancel = () => {
        reset()
        setDragItems(null)
    }

    const keys = columns.map((column) => column.key)
    return (
        <TooltipProvider>
            <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
                <SortableContext items={keys.map(columnSortableId)} strategy={horizontalListSortingStrategy}>
                    <div className={cn("flex min-h-0 flex-1 gap-3 overflow-x-auto pb-3", CONTENT_BLEED_X)} data-testid="work-board">
                        <AnimatePresence initial={false}>
                            {columns.map((column, index) => (
                                <WorkColumn
                                    key={column.key}
                                    column={column}
                                    works={(items[column.key] ?? []).map((id) => byId.get(id)).filter((work): work is WorkSummaryDto => work !== undefined)}
                                    rawCount={rawCounts[column.key] ?? 0}
                                    dragActive={activeWork !== null || activeColumn !== null}
                                    canShiftLeft={index > 1}
                                    canShiftRight={index < columns.length - 2}
                                    movingId={movingId}
                                    editable={editable}
                                    overview={overview}
                                    actions={actions}
                                    onOpen={onOpen}
                                />
                            ))}
                        </AnimatePresence>
                        {editable && !overview && (
                            <motion.button
                                type="button"
                                layout="position"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => actions.onCreateAfter(columns.at(-2)?.key ?? "validation")}
                                className="flex w-[200px] shrink-0 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
                            >
                                <Plus className="h-5 w-5" aria-hidden />
                                Nova coluna
                                <span className="px-4 text-center text-[11px]">Entra antes de Pago; arraste para outro ponto entre Abertura e Pago</span>
                            </motion.button>
                        )}
                    </div>
                </SortableContext>
                <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
                    {activeWork ? (
                        <div className="pointer-events-none relative w-[274px] rotate-2 scale-105">
                            <WorkCardView work={activeWork} overview={overview} dragging />
                        </div>
                    ) : activeColumn ? (
                        <div className={`pointer-events-none w-[290px] rotate-1 rounded-lg border border-t-4 bg-card p-3 shadow-2xl shadow-primary/20 ${activeColumn.border}`}>
                            <div className="flex items-center gap-2">
                                <ColumnIconView icon={activeColumn.column.icon} className="h-4 w-4 text-muted-foreground" />
                                <span className="text-xs font-semibold uppercase tracking-wide">{activeColumn.label}</span>
                                <span className="ml-auto rounded-sm border bg-background px-1.5 font-mono text-xs">{items[activeColumn.key]?.length ?? 0}</span>
                            </div>
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>
        </TooltipProvider>
    )
}
