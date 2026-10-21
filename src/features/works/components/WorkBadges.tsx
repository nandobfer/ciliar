"use client"

import { AlarmClock, AlertTriangle, Archive, Timer } from "lucide-react"
import { cn } from "@/lib/utils"
import { browserTimeZone, todayKeyIn } from "@/lib/timezone"
import { deadlineAlertLabel, formatMinutes } from "@/features/orders/logic"
import type { BoardColumnView } from "../board"
import { hoursProgress, workDeadlineAlert } from "../logic"

/** Selos dos trabalhos: coluna, prazo ("Vence em X dias"/"Atrasado"), horas estimadas × apontadas e arquivado. */

export function ColumnBadge({ column, className }: { column: Pick<BoardColumnView, "dot" | "label">; className?: string }) {
    return (
        <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs", className)}>
            <span className={cn("h-2 w-2 shrink-0 rounded-full", column.dot)} aria-hidden />
            <span className="truncate">{column.label}</span>
        </span>
    )
}

export function WorkDeadlineBadge({ column, dueDate, alertDays, className }: { column: string; dueDate: string | null; alertDays: number; className?: string }) {
    const alert = workDeadlineAlert({ column, dueDate }, todayKeyIn(browserTimeZone()), alertDays)
    if (!alert) return null
    const overdue = alert.kind === "overdue"
    const Icon = overdue ? AlertTriangle : AlarmClock
    return (
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium", overdue ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-warning/40 bg-warning/10 text-warning", className)}>
            <Icon className="h-3 w-3" aria-hidden />
            {deadlineAlertLabel(alert)}
        </span>
    )
}

/** Horas estimadas × apontadas, com a barra de progresso (acima da estimativa fica em alerta). */
export function HoursProgress({ estimatedMinutes, loggedMinutes, className, compact = false }: { estimatedMinutes: number; loggedMinutes: number; className?: string; compact?: boolean }) {
    const { percent, over } = hoursProgress(estimatedMinutes, loggedMinutes)
    const width = percent === null ? (loggedMinutes > 0 ? 100 : 0) : Math.min(100, percent)
    const label = `${formatMinutes(loggedMinutes)} de ${formatMinutes(estimatedMinutes)} h apontadas${percent !== null ? ` (${percent}%)` : ""}`
    return (
        <div className={cn("space-y-1", className)} title={label}>
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                    <Timer className="h-3 w-3" aria-hidden />
                    <span className={cn("font-mono tabular-nums", over && "text-warning")}>{formatMinutes(loggedMinutes)}</span>
                    <span>/</span>
                    <span className="font-mono tabular-nums">{formatMinutes(estimatedMinutes)} h</span>
                </span>
                {!compact && percent !== null && <span className={cn("font-mono tabular-nums", over && "text-warning")}>{percent}%</span>}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={width}>
                <div className={cn("h-full rounded-full transition-[width] duration-300", over ? "bg-warning" : "bg-primary")} style={{ width: `${width}%` }} />
            </div>
        </div>
    )
}

export function ArchivedBadge() {
    return (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
            <Archive className="h-3 w-3" aria-hidden /> Arquivado
        </span>
    )
}
