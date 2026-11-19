"use client"

import { useEffect, useRef, useState, type MouseEvent } from "react"
import { useDroppable } from "@dnd-kit/core"
import { useReducedMotion } from "framer-motion"
import { AlertTriangle, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { minuteOfDay } from "../time"
import type { CalendarEventDto } from "../types"
import { CalendarEventChip } from "./CalendarEventItem"
import { eventsOfDay, HOUR_HEIGHT, hourLabel, layoutTimed, minuteAtOffset, offWindows, WEEKDAY_SHORT } from "./calendar-layout"

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const ALL_DAY_MAX = 4

interface TimeGridViewProps {
    days: readonly string[]
    today: string
    timeZone: string
    events: readonly CalendarEventDto[]
    conflicts: Record<string, "info" | "strong">
    /** Expediente por dia (minutos do dia); sem expediente configurado, nada é sombreado. */
    windows: ReadonlyMap<string, readonly (readonly [number, number])[]>
    shadeOff: boolean
    canCreate: boolean
    onCreate: (date: string) => void
}

/**
 * Visões Semana/Dia (estilo Google Agenda/Teams): faixa de dia inteiro no topo (prazos, períodos e
 * horas apontadas) e a grade de horários (eventos do Google com hora). Fora do expediente fica
 * sombreado; uma linha tracejada segue o ponteiro e destaca o horário na coluna da esquerda; a
 * linha vermelha marca "agora".
 */
export function TimeGridView({ days, today, timeZone, events, conflicts, windows, shadeOff, canCreate, onCreate }: TimeGridViewProps) {
    const scroller = useRef<HTMLDivElement>(null)
    const [pointer, setPointer] = useState<number | null>(null)
    const [now, setNow] = useState(() => Date.now())
    const reduceMotion = useReducedMotion()

    // Começa no início do expediente (ou às 7h).
    useEffect(() => {
        const first = Math.min(7 * 60, ...days.flatMap((day) => (windows.get(day) ?? []).map(([start]) => start)))
        scroller.current?.scrollTo?.({ top: Math.max(0, (first / 60) * HOUR_HEIGHT - 8) })
        // Só ao montar: navegar entre semanas mantém a rolagem.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60_000)
        return () => clearInterval(timer)
    }, [])

    const onMove = (event: MouseEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect()
        setPointer(minuteAtOffset(event.clientY - rect.top))
    }
    const columns = `4rem repeat(${days.length}, minmax(0, 1fr))`
    const nowMinute = days.includes(today) ? minuteOfDay(now, timeZone) : null

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card" data-testid="calendar-timegrid">
            {/* Cabeçalho dos dias + faixa de dia inteiro */}
            <div className="grid border-b" style={{ gridTemplateColumns: columns }}>
                <div className="flex items-end justify-end border-r p-1 text-[10px] text-muted-foreground">dia inteiro</div>
                {days.map((day) => (
                    <AllDayCell key={day} day={day} today={day === today} events={eventsOfDay(events, day, { includeTimed: false })} conflict={conflicts[day] ?? null} canCreate={canCreate} onCreate={onCreate} />
                ))}
            </div>
            {/* Grade de horários */}
            <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
                <div className="relative grid" style={{ gridTemplateColumns: columns, height: 24 * HOUR_HEIGHT }} onMouseMove={onMove} onMouseLeave={() => setPointer(null)} data-testid="calendar-hours">
                    {/* Coluna dos horários (o do ponteiro fica destacado) */}
                    <div className="relative border-r">
                        {HOURS.map((hour) => (
                            <span key={hour} className={cn("absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground", hour === 0 && "hidden")} style={{ top: hour * HOUR_HEIGHT }}>
                                {hourLabel(hour * 60)}
                            </span>
                        ))}
                        {pointer !== null && (
                            <span data-testid="pointer-label" className="absolute right-1 z-20 -translate-y-1/2 rounded bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground shadow" style={{ top: (pointer / 60) * HOUR_HEIGHT }}>
                                {hourLabel(pointer)}
                            </span>
                        )}
                    </div>
                    {days.map((day) => (
                        <DayColumn key={day} day={day} timeZone={timeZone} events={events} off={shadeOff ? offWindows(windows.get(day) ?? []) : []} canCreate={canCreate} onCreate={onCreate} />
                    ))}
                    {/* Linhas das horas */}
                    <div className="pointer-events-none absolute inset-0 col-start-2 col-end-[-1]" aria-hidden>
                        {HOURS.map((hour) => (
                            <div key={hour} className="absolute inset-x-0 border-t border-border/60" style={{ top: hour * HOUR_HEIGHT }} />
                        ))}
                    </div>
                    {/* Linha tracejada que segue o ponteiro */}
                    {pointer !== null && (
                        <div data-testid="pointer-line" aria-hidden className={cn("pointer-events-none absolute right-0 z-10 border-t border-dashed border-primary/80", !reduceMotion && "transition-[top] duration-75")} style={{ left: "4rem", top: (pointer / 60) * HOUR_HEIGHT }} />
                    )}
                    {/* Agora */}
                    {nowMinute !== null && (
                        <div aria-label={`Agora, ${hourLabel(nowMinute)}`} className="pointer-events-none absolute z-10 border-t-2 border-destructive" style={{ top: (nowMinute / 60) * HOUR_HEIGHT, left: `calc(4rem + (100% - 4rem) * ${days.indexOf(today)} / ${days.length})`, width: `calc((100% - 4rem) / ${days.length})` }}>
                            <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-destructive" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function AllDayCell({ day, today, events, conflict, canCreate, onCreate }: { day: string; today: boolean; events: CalendarEventDto[]; conflict: "info" | "strong" | null; canCreate: boolean; onCreate: (date: string) => void }) {
    const { setNodeRef, isOver } = useDroppable({ id: `day:${day}`, data: { date: day } })
    const [expanded, setExpanded] = useState(false)
    const visible = expanded ? events : events.slice(0, ALL_DAY_MAX)
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
    return (
        <div ref={setNodeRef} data-date={day} data-conflict={conflict ?? undefined} className={cn("group min-w-0 space-y-0.5 border-r p-1 last:border-r-0", isOver && "bg-primary/10 ring-2 ring-inset ring-primary")}>
            <div className="flex items-center justify-between gap-1 pb-0.5">
                <span className="flex items-baseline gap-1 text-xs">
                    <span className="text-[10px] uppercase text-muted-foreground">{WEEKDAY_SHORT[weekday]}</span>
                    <span className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 font-semibold", today && "bg-primary text-primary-foreground")}>{Number(day.slice(8))}</span>
                </span>
                <span className="flex items-center gap-0.5">
                    {conflict && <AlertTriangle className={cn("h-3.5 w-3.5", conflict === "strong" ? "text-destructive" : "text-warning")} aria-label={conflict === "strong" ? "Conflito de capacidade" : "Sobreposição de prazos"} />}
                    {canCreate && (
                        <button type="button" onClick={() => onCreate(day)} aria-label={`Novo pedido com prazo em ${day.split("-").reverse().join("/")}`} className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100">
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                        </button>
                    )}
                </span>
            </div>
            {visible.map((event) => (
                <CalendarEventChip key={event.id} event={event} />
            ))}
            {events.length > ALL_DAY_MAX && (
                <button type="button" className="w-full rounded px-1 text-left text-[11px] font-medium text-muted-foreground hover:bg-muted" onClick={() => setExpanded((value) => !value)}>
                    {expanded ? "Mostrar menos" : `+${events.length - ALL_DAY_MAX}`}
                </button>
            )}
        </div>
    )
}

function DayColumn({ day, timeZone, events, off, canCreate, onCreate }: { day: string; timeZone: string; events: readonly CalendarEventDto[]; off: [number, number][]; canCreate: boolean; onCreate: (date: string) => void }) {
    const placements = layoutTimed(events, day, timeZone)
    return (
        <div
            data-date={day}
            className={cn("relative border-r last:border-r-0", canCreate && "cursor-pointer")}
            onClick={(event) => {
                // Clique num horário: cria o pedido com prazo no dia (a hora é ignorada; o prazo é só data).
                if (canCreate && event.target === event.currentTarget) onCreate(day)
            }}
        >
            {off.map(([start, end]) => (
                <div key={start} data-testid="off-hours" aria-hidden className="pointer-events-none absolute inset-x-0 bg-muted/60" style={{ top: (start / 60) * HOUR_HEIGHT, height: ((end - start) / 60) * HOUR_HEIGHT }} />
            ))}
            {placements.map((item) => (
                <div key={item.event.id} className="absolute z-[5] p-px" style={{ top: item.top, height: item.height, left: `${(item.lane / item.lanes) * 100}%`, width: `${100 / item.lanes}%` }}>
                    <CalendarEventChip event={item.event} className="h-full items-start" />
                </div>
            ))}
        </div>
    )
}
