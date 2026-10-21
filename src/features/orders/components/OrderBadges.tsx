"use client"

import { AlarmClock, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { todayKeyIn, browserTimeZone } from "@/lib/timezone"
import { OPEN_ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from "../constants"
import { deadlineAlert, deadlineAlertLabel } from "../logic"

/** Selos dos pedidos: status e alerta de prazo ("Vence em X dias"/"Atrasado"). */

const STATUS_CLASS: Record<OrderStatus, string> = {
    draft: "border-border bg-muted text-muted-foreground",
    sent: "border-primary/40 bg-primary/10 text-primary",
    accepted: "border-success/40 bg-success/10 text-success",
    rejected: "border-destructive/40 bg-destructive/10 text-destructive",
    cancelled: "border-border bg-transparent text-muted-foreground line-through",
}

export function OrderStatusPill({ status, className }: { status: OrderStatus; className?: string }) {
    return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_CLASS[status], className)}>{ORDER_STATUS_LABELS[status]}</span>
}

/** Alerta de prazo dos pedidos abertos (rascunho/enviado), pela antecedência do negócio. */
export function DeadlineBadge({ status, dueDate, alertDays, className }: { status: OrderStatus; dueDate: string | null; alertDays: number; className?: string }) {
    if (!OPEN_ORDER_STATUSES.includes(status)) return null
    const alert = deadlineAlert(dueDate, todayKeyIn(browserTimeZone()), alertDays)
    if (!alert) return null
    const overdue = alert.kind === "overdue"
    const Icon = overdue ? AlertTriangle : AlarmClock
    return (
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", overdue ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-warning/40 bg-warning/10 text-warning", className)}>
            <Icon className="h-3 w-3" aria-hidden />
            {deadlineAlertLabel(alert)}
        </span>
    )
}

export const dateKeyLabel = (key: string | null | undefined) => (key ? key.split("-").reverse().join("/") : "—")
