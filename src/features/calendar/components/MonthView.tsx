"use client"

import { useDroppable } from "@dnd-kit/core"
import { AlertTriangle, Plus } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { eachDayKey } from "../time"
import type { CalendarEventDto } from "../types"
import { CalendarEventChip } from "./CalendarEventItem"
import { eventsOfDay, WEEKDAY_SHORT } from "./calendar-layout"

const MAX_CHIPS = 3

interface MonthViewProps {
    from: string
    to: string
    anchor: string
    today: string
    timeZone: string
    events: readonly CalendarEventDto[]
    conflicts: Record<string, "info" | "strong">
    /** Dias sem expediente (sombreados). */
    offDays: ReadonlySet<string>
    canCreate: boolean
    onCreate: (date: string) => void
}

/** Visão Mês: grade de dias com eventos de dia inteiro; o que não cabe vira "+N". */
export function MonthView({ from, to, anchor, today, timeZone, events, conflicts, offDays, canCreate, onCreate }: MonthViewProps) {
    const days = eachDayKey(from, to)
    const month = anchor.slice(0, 7)
    return (
        <div className="overflow-hidden rounded-lg border bg-card" data-testid="calendar-month">
            <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {WEEKDAY_SHORT.map((label) => (
                    <div key={label} className="py-2">
                        {label}
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-7 auto-rows-[minmax(6.5rem,1fr)]">
                {days.map((day) => (
                    <MonthCell key={day} day={day} outside={day.slice(0, 7) !== month} today={day === today} events={eventsOfDay(events, day, { timeZone })} conflict={conflicts[day] ?? null} off={offDays.has(day)} canCreate={canCreate} onCreate={onCreate} />
                ))}
            </div>
        </div>
    )
}

function MonthCell({ day, outside, today, events, conflict, off, canCreate, onCreate }: { day: string; outside: boolean; today: boolean; events: CalendarEventDto[]; conflict: "info" | "strong" | null; off: boolean; canCreate: boolean; onCreate: (date: string) => void }) {
    const { setNodeRef, isOver } = useDroppable({ id: `day:${day}`, data: { date: day } })
    const visible = events.slice(0, MAX_CHIPS)
    const hidden = events.length - visible.length
    return (
        <div
            ref={setNodeRef}
            data-date={day}
            data-conflict={conflict ?? undefined}
            className={cn(
                "group relative flex min-w-0 flex-col gap-0.5 border-b border-r p-1 [&:nth-child(7n)]:border-r-0",
                off && "bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,var(--color-muted)_6px,var(--color-muted)_8px)]",
                outside && "text-muted-foreground/60",
                isOver && "bg-primary/10 ring-2 ring-inset ring-primary",
                conflict === "strong" && "shadow-[inset_0_2px_0_0_var(--color-destructive)]",
                conflict === "info" && "shadow-[inset_0_2px_0_0_var(--color-warning)]",
            )}
        >
            <div className="flex items-center justify-between">
                <span className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium", today && "bg-primary text-primary-foreground")}>{Number(day.slice(8))}</span>
                <span className="flex items-center gap-1">
                    {conflict && <AlertTriangle className={cn("h-3.5 w-3.5", conflict === "strong" ? "text-destructive" : "text-warning")} aria-label={conflict === "strong" ? "Conflito de capacidade" : "Sobreposição de prazos"} />}
                    {canCreate && (
                        <button type="button" onClick={() => onCreate(day)} aria-label={`Novo pedido com prazo em ${day.split("-").reverse().join("/")}`} className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100">
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                        </button>
                    )}
                </span>
            </div>
            {visible.map((event) => (
                <CalendarEventChip key={event.id} event={event} compact continued={event.kind === "work-period" && event.start < day && !day.endsWith("-01") && new Date(`${day}T12:00:00Z`).getUTCDay() !== 0} />
            ))}
            {hidden > 0 && (
                <Popover>
                    <PopoverTrigger asChild>
                        <button type="button" className="w-full rounded px-1 text-left text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                            +{hidden}
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 space-y-1 p-2" align="start">
                        <p className="px-1 pb-1 text-xs font-semibold">{day.split("-").reverse().join("/")}</p>
                        {events.map((event) => (
                            <CalendarEventChip key={event.id} event={event} />
                        ))}
                    </PopoverContent>
                </Popover>
            )}
            {canCreate && <button type="button" tabIndex={-1} aria-hidden onClick={() => onCreate(day)} className="min-h-2 flex-1 cursor-pointer" />}
        </div>
    )
}
