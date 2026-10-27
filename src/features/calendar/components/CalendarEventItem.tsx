"use client"

import { useState, type CSSProperties, type ReactNode } from "react"
import Link from "next/link"
import { useDraggable } from "@dnd-kit/core"
import { AlertTriangle, CalendarClock, CalendarRange, ExternalLink, Hammer, Info, ReceiptText, RefreshCw, Timer, Unlink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { formatMinutes } from "@/features/orders/logic"
import { dateKeyLabel } from "@/features/orders/components/OrderBadges"
import { orderHref } from "@/features/orders/components/OrdersPage"
import { workHref } from "@/features/works/constants"
import type { CalendarEventDto } from "../types"
import { useGoogleRepublish } from "../hooks/useCalendar"
import { DeadlineConflictNotice } from "./DeadlineConflictAlert"

/** Rótulo do tipo do evento. */
export const EVENT_KIND_LABELS: Record<CalendarEventDto["kind"], string> = {
    "work-deadline": "Prazo do trabalho",
    "work-period": "Período do trabalho",
    "order-deadline": "Prazo do pedido",
    "logged-hours": "Horas apontadas",
    google: "Google Agenda",
}

const KIND_ICONS: Record<CalendarEventDto["kind"], typeof Hammer> = {
    "work-deadline": Hammer,
    "work-period": CalendarRange,
    "order-deadline": ReceiptText,
    "logged-hours": Timer,
    google: CalendarClock,
}

const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

/** Texto curto do chip. */
export function chipText(event: CalendarEventDto): string {
    if (event.kind === "logged-hours") return `${formatMinutes(event.minutes ?? 0)} apontadas`
    const title = event.code ? `${event.code} · ${event.title}` : event.title
    if (event.kind === "google" && !event.allDay) return `${timeLabel(event.start)} ${title}`
    return title
}

/** Chip de um evento (cor do negócio), arrastável quando o prazo pode mudar. Clique abre o resumo. */
export function CalendarEventChip({ event, compact = false, continued = false, style, className }: { event: CalendarEventDto; compact?: boolean; continued?: boolean; style?: CSSProperties; className?: string }) {
    const [open, setOpen] = useState(false)
    const canDrag = event.draggable && (event.kind === "work-deadline" || event.kind === "order-deadline")
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: event.id, data: { event }, disabled: !canDrag })
    const Icon = KIND_ICONS[event.kind]
    const period = event.kind === "work-period"
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    ref={setNodeRef}
                    type="button"
                    {...(canDrag ? attributes : {})}
                    {...(canDrag ? listeners : {})}
                    aria-label={`${EVENT_KIND_LABELS[event.kind]}: ${chipText(event)}${event.conflict ? (event.conflict === "strong" ? " (capacidade insuficiente)" : " (sobreposição)") : ""}${canDrag ? ". Espaço para arrastar o prazo" : ""}`}
                    data-kind={event.kind}
                    data-conflict={event.conflict ?? undefined}
                    style={{ ...style, ["--event-color" as string]: event.color }}
                    className={cn(
                        "group flex w-full min-w-0 items-center gap-1 overflow-hidden rounded-[5px] border-l-[3px] px-1.5 text-left text-[11px] leading-5 transition-[opacity,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        "border-l-[var(--event-color)] bg-[color-mix(in_srgb,var(--event-color)_16%,transparent)] text-foreground hover:bg-[color-mix(in_srgb,var(--event-color)_26%,transparent)]",
                        period && "rounded-none border-l-0 bg-[color-mix(in_srgb,var(--event-color)_10%,transparent)] text-muted-foreground",
                        event.kind === "google" && "border-dashed",
                        event.conflict === "strong" && "ring-1 ring-destructive/70",
                        event.conflict === "info" && "ring-1 ring-warning/70",
                        canDrag && "cursor-grab active:cursor-grabbing",
                        isDragging && "opacity-40",
                        className,
                    )}
                >
                    {!compact && <Icon className="h-3 w-3 shrink-0 opacity-70" aria-hidden />}
                    <span className={cn("min-w-0 flex-1 truncate", continued && "opacity-0")}>{chipText(event)}</span>
                    {event.conflict && <AlertTriangle className={cn("h-3 w-3 shrink-0", event.conflict === "strong" ? "text-destructive" : "text-warning")} aria-hidden />}
                    {event.deadlineLabel && !compact && <span className={cn("shrink-0 rounded px-1 text-[10px] font-medium", event.deadlineOverdue ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning")}>{event.deadlineLabel}</span>}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 space-y-3 p-4" align="start">
                {open && <EventSummary event={event} onClose={() => setOpen(false)} />}
            </PopoverContent>
        </Popover>
    )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex justify-between gap-3 text-xs">
            <span className="text-muted-foreground">{label}</span>
            <span className="min-w-0 text-right font-medium">{children}</span>
        </div>
    )
}

/** Resumo do evento com "Ver trabalho"/"Ver pedido", o alerta de conflito e o vínculo com o Google. */
export function EventSummary({ event, onClose }: { event: CalendarEventDto; onClose: () => void }) {
    const republish = useGoogleRepublish()
    const Icon = KIND_ICONS[event.kind]
    const checkConflict = (event.kind === "work-deadline" || event.kind === "order-deadline") && Boolean(event.businessId)
    return (
        <>
            <div className="flex items-start gap-2">
                <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm" style={{ background: event.color }} aria-hidden />
                <div className="min-w-0">
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Icon className="h-3 w-3" aria-hidden /> {EVENT_KIND_LABELS[event.kind]}
                    </p>
                    <p className="font-semibold leading-snug">{event.code ? `${event.code} · ${event.title}` : event.title}</p>
                    {event.businessName && <p className="text-xs text-muted-foreground">{event.businessName}</p>}
                </div>
            </div>
            <div className="space-y-1">
                {event.allDay ? (
                    event.start === event.end ? <Row label={event.kind === "logged-hours" ? "Dia" : "Data"}>{dateKeyLabel(event.start)}</Row> : <Row label="Período">{`${dateKeyLabel(event.start)} a ${dateKeyLabel(event.end)}`}</Row>
                ) : (
                    <Row label="Horário">{`${new Date(event.start).toLocaleDateString("pt-BR")} ${timeLabel(event.start)}–${timeLabel(event.end)}`}</Row>
                )}
                {event.statusLabel && <Row label={event.kind === "google" ? "Disponibilidade" : "Situação"}>{event.statusLabel}</Row>}
                {event.deadlineLabel && <Row label="Prazo">{event.deadlineLabel}</Row>}
                {event.google && <Row label="Agenda">{event.google.calendarName}</Row>}
                {event.kind === "logged-hours" && <Row label="Total">{formatMinutes(event.minutes ?? 0)}</Row>}
            </div>
            {event.details && (
                <ul className="space-y-1 border-t pt-2 text-xs">
                    {event.details.map((item) => (
                        <li key={item.workId} className="flex justify-between gap-2">
                            <Link href={workHref(item.businessId, item.workId)} className="min-w-0 truncate text-primary hover:underline" onClick={onClose}>
                                {item.code} · {item.title}
                            </Link>
                            <span className="shrink-0 tabular-nums">{formatMinutes(item.minutes)}</span>
                        </li>
                    ))}
                </ul>
            )}
            {checkConflict && <DeadlineConflictNotice params={event.kind === "work-deadline" ? { businessId: event.businessId, workId: event.workId } : { businessId: event.businessId, orderId: event.orderId }} />}
            {event.googleLink?.status === "unlinked" && (
                <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-2 text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground">
                        <Unlink className="h-3 w-3" aria-hidden /> Excluído no Google
                    </span>
                    <Button size="sm" variant="outline" className="h-7 gap-1" disabled={republish.isPending} onClick={() => republish.mutate({ kind: event.kind, id: event.kind === "order-deadline" ? event.orderId! : event.workId! })}>
                        <RefreshCw className="h-3 w-3" aria-hidden /> Republicar
                    </Button>
                </div>
            )}
            {event.draggable && (
                <p className="flex items-start gap-1 text-[11px] text-muted-foreground">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> Arraste para outro dia para mudar o prazo.
                </p>
            )}
            <div className="flex flex-wrap gap-2">
                {event.workId && event.businessId && event.kind !== "logged-hours" && (
                    <Button asChild size="sm" variant="outline" className="h-8 gap-1">
                        <Link href={workHref(event.businessId, event.workId)} onClick={onClose}>
                            <Hammer className="h-3.5 w-3.5" aria-hidden /> Ver trabalho
                        </Link>
                    </Button>
                )}
                {event.orderId && event.businessId && (
                    <Button asChild size="sm" variant="outline" className="h-8 gap-1">
                        <Link href={orderHref(event.businessId, event.orderId)} onClick={onClose}>
                            <ReceiptText className="h-3.5 w-3.5" aria-hidden /> Ver pedido
                        </Link>
                    </Button>
                )}
                {event.google?.htmlLink && (
                    <Button asChild size="sm" variant="outline" className="h-8 gap-1">
                        <a href={event.google.htmlLink} target="_blank" rel="noreferrer noopener">
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Abrir no Google
                        </a>
                    </Button>
                )}
            </div>
        </>
    )
}
