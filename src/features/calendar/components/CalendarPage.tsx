"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { toast } from "sonner"
import { z } from "zod"
import { AlertTriangle, Briefcase, CalendarClock, ChevronLeft, ChevronRight, Filter, Info, Plus, RefreshCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Skeleton } from "@/components/ui/skeleton"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { ErrorState } from "@/components/feedback/ErrorState"
import { usePersistentState } from "@/hooks/usePersistentState"
import { apiErrorMessage } from "@/lib/api"
import { browserTimeZone, todayKeyIn } from "@/lib/timezone"
import { cn } from "@/lib/utils"
import { useAppSession } from "@/features/access/components/AccessProvider"
import { dateKeyLabel } from "@/features/orders/components/OrderBadges"
import { CALENDAR_EVENT_KINDS, CALENDAR_FILTER_LABELS, CALENDAR_FILTERS, CALENDAR_VIEW_LABELS, CALENDAR_VIEWS, calendarPrefsKey, type CalendarEventKind, type CalendarFilter, type CalendarView } from "../constants"
import { eachDayKey, rangeOfView, shiftAnchor } from "../time"
import type { CalendarEventDto, DeadlineConflictDto } from "../types"
import { useCalendarRange, useCalendarRealtime, useMoveDeadline } from "../hooks/useCalendar"
import { chipText } from "./CalendarEventItem"
import { DeadlineConflictAlert } from "./DeadlineConflictAlert"
import { GoogleCalendarDialog } from "./GoogleCalendarDialog"
import { MonthView } from "./MonthView"
import { NewOrderDialog } from "./NewOrderDialog"
import { TimeGridView } from "./TimeGridView"

const prefsSchema = z.object({
    view: z.enum(CALENDAR_VIEWS).catch("week"),
    filters: z.array(z.enum(CALENDAR_FILTERS)).catch([...CALENDAR_FILTERS]),
    businesses: z.array(z.string()).catch([]),
})
type Prefs = z.infer<typeof prefsSchema>
const DEFAULT_PREFS: Prefs = { view: "week", filters: [...CALENDAR_FILTERS], businesses: [] }

/** Título do período visível ("outubro de 2026", "25 – 31 de out. de 2026", "terça-feira, 27 de outubro"). */
export function periodLabel(view: CalendarView, anchor: string, from: string, to: string): string {
    const date = (key: string) => new Date(`${key}T12:00:00`)
    if (view === "month") return format(date(anchor), "MMMM 'de' yyyy", { locale: ptBR })
    if (view === "day") return format(date(anchor), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })
    const sameMonth = from.slice(0, 7) === to.slice(0, 7)
    return `${format(date(from), sameMonth ? "d" : "d 'de' MMM", { locale: ptBR })} – ${format(date(to), "d 'de' MMM 'de' yyyy", { locale: ptBR })}`
}

/**
 * Calendário (CIL-4), estilo Google Agenda/Teams: `/calendario` (todos os negócios do dono efetivo,
 * filtro por negócio) ou a aba do negócio (`businessId`). Visões Dia/Semana/Mês; prazos e períodos dos
 * trabalhos, prazos dos pedidos abertos, horas apontadas, expediente e Google; criar pedido clicando no
 * dia/horário ou no botão; arrastar o prazo (W1/D3) com o alerta de conflito, que nunca bloqueia.
 */
export function CalendarPage({ businessId = null, editable = true }: { businessId?: string | null; editable?: boolean }) {
    const reduceMotion = useReducedMotion()
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { session } = useAppSession()
    const timeZone = useMemo(() => browserTimeZone(), [])
    const today = todayKeyIn(timeZone)
    const { value: prefs, setValue: setPrefs, ready } = usePersistentState<Prefs>(calendarPrefsKey(businessId), prefsSchema, DEFAULT_PREFS)
    const [anchor, setAnchor] = useState(today)
    const { from, to } = rangeOfView(prefs.view, anchor)
    const types = useMemo(() => CALENDAR_EVENT_KINDS.filter((kind) => prefs.filters.includes(kind)) as CalendarEventKind[], [prefs.filters])
    const query = useCalendarRange({ from, to, businessId, types }, ready)
    const move = useMoveDeadline()
    const [newOrder, setNewOrder] = useState<string | null>(null)
    // Voltando da conexão com o Google, o diálogo já abre para escolher as agendas.
    const [googleOpen, setGoogleOpen] = useState(() => searchParams.get("google") === "conectado")
    const [dragging, setDragging] = useState<CalendarEventDto | null>(null)
    const [lastMove, setLastMove] = useState<{ event: CalendarEventDto; date: string; conflict: DeadlineConflictDto | null } | null>(null)
    useCalendarRealtime(session?.user.id ?? null, Boolean(session) && !session?.access.simulation)

    // Retorno da conexão com o Google (`?google=conectado|cancelado|erro`).
    useEffect(() => {
        const result = searchParams.get("google")
        if (!result) return
        if (result === "conectado") toast.success("Google Agenda conectado: escolha a agenda de publicação e as agendas lidas")
        else if (result === "cancelado") toast.info("Conexão com o Google cancelada")
        else toast.error(searchParams.get("mensagem") ?? "Não foi possível conectar o Google Agenda")
        router.replace(pathname, { scroll: false })
    }, [searchParams, router, pathname])

    const data = query.data
    const businesses = data?.businesses ?? []
    const events = useMemo(() => (data?.events ?? []).filter((event) => types.includes(event.kind)).filter((event) => businessId || !prefs.businesses.length || !event.businessId || prefs.businesses.includes(event.businessId)), [data, types, prefs.businesses, businessId])
    const showAvailability = prefs.filters.includes("availability") && !data?.noAvailability
    const windows = useMemo(() => new Map((data?.availability ?? []).map((day) => [day.date, day.windows] as const)), [data])
    const offDays = useMemo(() => new Set(showAvailability ? (data?.availability ?? []).filter((day) => !day.windows.length).map((day) => day.date) : []), [data, showAvailability])
    const canCreate = editable && Boolean(data?.own) && businesses.some((business) => business.canCreateOrders)

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }))
    const onDragStart = (event: DragStartEvent) => setDragging((event.active.data.current?.event as CalendarEventDto | undefined) ?? null)
    const onDragEnd = ({ active, over }: DragEndEvent) => {
        setDragging(null)
        const event = active.data.current?.event as CalendarEventDto | undefined
        const date = over?.data.current?.date as string | undefined
        if (!event || !date || date === event.start) return
        move.mutate(
            { event, dueDate: date },
            {
                onSuccess: (conflict) => {
                    setLastMove({ event, date, conflict })
                    if (conflict?.level === "strong") toast.warning(`Prazo movido para ${dateKeyLabel(date)}, mas faltam horas livres até lá`)
                    else if (conflict?.level === "info") toast.success(`Prazo movido para ${dateKeyLabel(date)} (com sobreposição)`)
                    else toast.success(`Prazo movido para ${dateKeyLabel(date)}`)
                },
            },
        )
    }

    const setView = (view: CalendarView) => setPrefs((current) => ({ ...current, view }))
    const days = eachDayKey(from, to)
    const returnTo = businessId ? `/negocios/${businessId}/calendario` : "/calendario"

    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }} className="flex flex-col gap-4 md:min-h-full md:flex-1">
            <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0 flex-1">
                    <CadastroHeader title="Calendário" description={businessId ? "Prazos, períodos e horas deste negócio; a capacidade considera todos os seus negócios" : "Prazos, períodos e horas de todos os seus negócios, com o expediente e o Google Agenda"} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {data?.own && (
                        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setGoogleOpen(true)}>
                            <CalendarClock className={cn("h-4 w-4", data.google?.connected ? (data.google.status === "active" ? "text-success" : "text-warning") : "text-muted-foreground")} aria-hidden />
                            {data.google?.connected ? "Google Agenda" : "Conectar Google Agenda"}
                        </Button>
                    )}
                    {canCreate && (
                        <Button type="button" size="sm" className="h-9 gap-1.5" onClick={() => setNewOrder(anchor < today ? today : anchor)}>
                            <Plus className="h-4 w-4" aria-hidden /> Novo pedido
                        </Button>
                    )}
                </div>
            </header>

            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setAnchor(today)}>
                        Hoje
                    </Button>
                    <div className="flex items-center">
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label="Anterior" onClick={() => setAnchor((current) => shiftAnchor(prefs.view, current, -1))}>
                            <ChevronLeft className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label="Próximo" onClick={() => setAnchor((current) => shiftAnchor(prefs.view, current, 1))}>
                            <ChevronRight className="h-4 w-4" aria-hidden />
                        </Button>
                    </div>
                    <h2 className="min-w-0 text-base font-semibold capitalize" aria-live="polite" data-testid="calendar-period">
                        {periodLabel(prefs.view, anchor, from, to)}
                    </h2>
                    <DatePicker value={anchor} onChange={(value) => value && setAnchor(value)} className="h-9 w-[9.5rem]" placeholder="Ir para data" />
                    {query.isFetching && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Atualizando" />}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <CalendarViewSwitch value={prefs.view} onChange={setView} />
                    <CadastroMultiSelect
                        aria-label="Filtros do calendário"
                        icon={Filter}
                        placeholder="Nada visível"
                        className="h-9 w-[12rem]"
                        selected={prefs.filters}
                        selectAllLabel="Todos"
                        onSelect={(selected) => setPrefs((current) => ({ ...current, filters: selected.filter((value): value is CalendarFilter => (CALENDAR_FILTERS as readonly string[]).includes(value)) }))}
                        options={CALENDAR_FILTERS.map((filter) => ({ value: filter, label: CALENDAR_FILTER_LABELS[filter] }))}
                    />
                    {!businessId && businesses.length > 1 && (
                        <CadastroMultiSelect
                            aria-label="Negócio"
                            icon={Briefcase}
                            placeholder="Todos os negócios"
                            className="h-9 w-[12rem]"
                            searchable
                            selected={prefs.businesses}
                            onSelect={(selected) => setPrefs((current) => ({ ...current, businesses: selected }))}
                            options={businesses.map((business) => ({ value: business.id, label: business.name }))}
                        />
                    )}
                </div>
            </div>

            {!businessId && businesses.length > 1 && (
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Cores dos negócios">
                    {businesses.map((business) => (
                        <li key={business.id} className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: business.color }} aria-hidden />
                            {business.name}
                        </li>
                    ))}
                </ul>
            )}

            {data?.googleError && prefs.filters.includes("google") && (
                <p role="alert" className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 p-2.5 text-sm text-warning">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Google Agenda indisponível: {data.googleError} O resto do calendário continua funcionando.
                </p>
            )}
            {data?.noAvailability && prefs.filters.includes("availability") && (
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Nenhum negócio tem a disponibilidade (expediente) configurada na Ficha: sem expediente, o alerta de capacidade considera zero horas livres.
                </p>
            )}
            {lastMove && (
                <div className="relative">
                    <DeadlineConflictAlert conflict={lastMove.conflict} className="pr-9" />
                    {lastMove.conflict && lastMove.conflict.level !== "none" && (
                        <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7" aria-label="Fechar aviso" onClick={() => setLastMove(null)}>
                            <X className="h-4 w-4" aria-hidden />
                        </Button>
                    )}
                </div>
            )}

            {!ready || (query.isPending && !data) ? (
                <Skeleton className="h-[32rem] w-full" aria-label="Carregando calendário" />
            ) : query.isError && !data ? (
                <ErrorState title="Não foi possível carregar o calendário" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : (
                <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
                    {prefs.view === "month" ? (
                        <MonthView from={from} to={to} anchor={anchor} today={today} timeZone={timeZone} events={events} conflicts={data?.conflicts ?? {}} offDays={offDays} canCreate={canCreate} onCreate={setNewOrder} />
                    ) : (
                        <div className="flex h-[min(78vh,56rem)] min-h-[28rem] flex-col">
                            <TimeGridView days={prefs.view === "day" ? [anchor] : days} today={today} timeZone={timeZone} events={events} conflicts={data?.conflicts ?? {}} windows={windows} shadeOff={showAvailability} canCreate={canCreate} onCreate={setNewOrder} />
                        </div>
                    )}
                    <DragOverlay dropAnimation={reduceMotion ? null : undefined}>
                        {dragging ? (
                            <div className="rounded-[5px] border-l-[3px] bg-card px-1.5 text-[11px] leading-5 shadow-lg" style={{ borderLeftColor: dragging.color }}>
                                {chipText(dragging)}
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>
            )}

            {newOrder && <NewOrderDialog date={newOrder} businesses={businesses} initialBusinessId={businessId} preferredBusinessId={prefs.businesses.length === 1 ? prefs.businesses[0]! : null} onClose={() => setNewOrder(null)} />}
            {data?.own && <GoogleCalendarDialog open={googleOpen} onOpenChange={setGoogleOpen} connection={data.google} returnTo={returnTo} />}
        </motion.section>
    )
}

/** Dia | Semana | Mês (o mesmo switch das visões dos Trabalhos). */
export function CalendarViewSwitch({ value, onChange, className }: { value: CalendarView; onChange: (value: CalendarView) => void; className?: string }) {
    return (
        <div role="radiogroup" aria-label="Visão do calendário" className={cn("flex items-center gap-1 rounded-md border border-border bg-card p-1", className)}>
            {CALENDAR_VIEWS.map((view) => {
                const active = value === view
                return (
                    <button
                        key={view}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onChange(view)}
                        className={cn("relative inline-flex items-center justify-center rounded-md px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors", active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                    >
                        {active && <motion.span layoutId="calendar-view-switch" className="absolute inset-0 rounded-md bg-primary shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                        <span className="relative">{CALENDAR_VIEW_LABELS[view]}</span>
                    </button>
                )
            })}
        </div>
    )
}
