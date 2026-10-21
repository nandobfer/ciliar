"use client"

import type { HTMLAttributes } from "react"
import { motion } from "framer-motion"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Briefcase, CheckCircle2, Layers, Loader2, UserRound } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/features/businesses/format"
import { isFixedWorkColumn } from "../constants"
import type { WorkSummaryDto } from "../types"
import { ArchivedBadge, HoursProgress, WorkDeadlineBadge } from "./WorkBadges"

interface WorkCardViewProps {
    work: WorkSummaryDto
    /** Visão geral: mostra o negócio e, nas customizadas ("Outras etapas"), o nome da coluna real. */
    overview?: boolean
    moving?: boolean
    dragging?: boolean
    onOpen?: () => void
    handleProps?: HTMLAttributes<HTMLDivElement>
}

/** Card do quadro: código do pedido + título, cliente, valor, prazo com alerta e horas estimadas × apontadas. */
export function WorkCardView({ work, overview = false, moving = false, dragging = false, onOpen, handleProps }: WorkCardViewProps) {
    const paid = work.column === "paid" && work.payment
    return (
        <div
            {...handleProps}
            role="button"
            tabIndex={0}
            aria-label={`Abrir ${work.code}: ${work.title}`}
            onClick={() => onOpen?.()}
            onKeyDown={(event) => {
                if (event.key === "Enter") onOpen?.()
                handleProps?.onKeyDown?.(event)
            }}
            className={cn(
                "group relative cursor-grab select-none rounded-md border bg-card p-2.5 shadow-xs transition-colors hover:border-primary/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary active:cursor-grabbing",
                work.status === "archived" && "opacity-70",
                dragging && "cursor-grabbing border-primary shadow-lg shadow-primary/20 ring-1 ring-primary/40",
            )}
        >
            <div className="mb-1.5 flex items-center gap-1.5">
                <span className="font-mono text-[11px] font-semibold text-primary">{work.code}</span>
                <span className="ml-auto flex items-center gap-1 text-muted-foreground">{moving && <Loader2 className="h-3 w-3 animate-spin" aria-label="Movendo" />}</span>
            </div>
            <h4 className="mb-1.5 line-clamp-2 text-xs font-semibold leading-snug transition-colors group-hover:text-primary" title={work.title}>
                {work.title}
            </h4>
            <div className="mb-2 space-y-0.5 text-[11px] text-muted-foreground">
                <p className="flex min-w-0 items-center gap-1">
                    <UserRound className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">{work.clientName ?? "Cliente removido"}</span>
                </p>
                {overview && work.businessName && (
                    <p className="flex min-w-0 items-center gap-1">
                        <Briefcase className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="truncate">{work.businessName}</span>
                    </p>
                )}
                {overview && !isFixedWorkColumn(work.column) && (
                    <p className="flex min-w-0 items-center gap-1 text-violet-400">
                        <Layers className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="truncate">{work.columnName}</span>
                    </p>
                )}
            </div>
            <HoursProgress estimatedMinutes={work.estimatedMinutes} loggedMinutes={work.loggedMinutes} compact className="mb-2" />
            <div className="flex items-center justify-between gap-1.5 border-t pt-2">
                <span className="font-mono text-[11px] font-semibold">{formatMoney(work.totalCents, work.currency)}</span>
                <span className="flex min-w-0 flex-wrap items-center justify-end gap-1">
                    {paid && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-1.5 py-px text-[10px] font-medium text-success" title={`Recebido ${formatMoney(work.payment!.receivedCents, work.currency)}`}>
                            <CheckCircle2 className="h-3 w-3" aria-hidden /> {work.payment!.paidOn.split("-").reverse().join("/")}
                        </span>
                    )}
                    <WorkDeadlineBadge column={work.column} dueDate={work.dueDate} alertDays={work.deadlineAlertDays} />
                    {work.status === "archived" && <ArchivedBadge />}
                </span>
            </div>
        </div>
    )
}

interface SortableWorkCardProps {
    work: WorkSummaryDto
    columnKey: string
    overview: boolean
    moving: boolean
    disabled: boolean
    /** Anima a troca de posição (desligado durante o arraste, que usa as transformações do dnd-kit). */
    layoutEnabled: boolean
    onOpen: () => void
}

/**
 * Card arrastável. A transformação do dnd-kit fica no invólucro (os vizinhos abrem espaço na hora);
 * o Framer Motion anima entrada/saída e a acomodação depois de soltar.
 */
export function SortableWorkCard({ work, columnKey, overview, moving, disabled, layoutEnabled, onOpen }: SortableWorkCardProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: work.id, data: { type: "card", key: columnKey }, disabled })
    return (
        <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className="relative" data-testid={`work-card-${work.id}`}>
            {isDragging && <div className="absolute inset-0 rounded-md border-2 border-dashed border-primary/60 bg-primary/5" aria-hidden />}
            <motion.div layout={layoutEnabled ? "position" : false} initial={{ opacity: 0, y: 6 }} animate={{ opacity: isDragging ? 0 : 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.2 }}>
                <WorkCardView work={work} overview={overview} moving={moving} onOpen={onOpen} handleProps={{ ...attributes, ...listeners } as HTMLAttributes<HTMLDivElement>} />
            </motion.div>
        </div>
    )
}
