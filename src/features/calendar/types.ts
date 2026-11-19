import type { OrderStatus } from "@/features/orders/constants"
import type { CalendarEventKind, GoogleConnectionStatus, GoogleLinkKind } from "./constants"
import type { DeadlineConflict } from "./conflict"

/** Evento do calendário (derivado na leitura; o calendário não guarda eventos próprios). */
export interface CalendarEventDto {
    /** Único na resposta (`work-deadline:<id>`, `google:<agenda>:<evento>`…). */
    id: string
    kind: CalendarEventKind
    businessId: string | null
    businessName: string | null
    /** Cor do negócio (`#RRGGBB`) ou da agenda do Google. */
    color: string
    title: string
    subtitle: string | null
    allDay: boolean
    /** Dia inteiro: chaves `AAAA-MM-DD` (fim inclusivo); com hora: ISO. */
    start: string
    end: string
    workId: string | null
    orderId: string | null
    code: string | null
    /** Status do pedido aberto ou nome da coluna do trabalho. */
    statusLabel: string | null
    orderStatus: OrderStatus | null
    column: string | null
    /** Selo de prazo (`workDeadlineAlert`/`deadlineAlert`): "Vence hoje", "Atrasado"… */
    deadlineLabel: string | null
    deadlineOverdue: boolean
    conflict: "info" | "strong" | null
    /** Pode arrastar o prazo (permissão + estado). */
    draggable: boolean
    /** Versão do trabalho ou do pedido (para o PATCH do arraste). */
    version: number | null
    /** Horas apontadas do dia (minutos) e detalhes por trabalho. */
    minutes: number | null
    details: { workId: string; businessId: string; code: string; title: string; minutes: number }[] | null
    /** Evento do Google: agenda e link; para os do Ciliar, o vínculo publicado. */
    google: { calendarId: string; calendarName: string; htmlLink: string | null; busy: boolean } | null
    googleLink: { status: "linked" | "unlinked" | "pending"; htmlLink: string | null } | null
}

export interface CalendarBusinessDto {
    id: string
    name: string
    color: string
    canCreateOrders: boolean
    canEditOrders: boolean
    canEditWorks: boolean
}

export interface GoogleCalendarItemDto {
    id: string
    name: string
    color: string | null
    primary: boolean
    writable: boolean
}

/** Conexão Google do dono efetivo — nunca tokens. */
export interface GoogleConnectionDto {
    connected: boolean
    configured: boolean
    status: GoogleConnectionStatus | null
    googleEmail: string | null
    publishCalendarId: string | null
    publishCalendarName: string | null
    readCalendars: { id: string; name: string; color: string | null }[]
    lastSyncAt: string | null
    lastError: string | null
    backoffUntil: string | null
    pendingLinks: number
    unlinked: number
}

export interface CalendarRangeDto {
    from: string
    to: string
    timeZone: string
    events: CalendarEventDto[]
    /** Expediente (minutos do dia, união dos negócios) por dia visível. */
    availability: { date: string; windows: [number, number][] }[]
    noAvailability: boolean
    /** Marcação de conflito por dia (o mais forte do dia). */
    conflicts: Record<string, "info" | "strong">
    businesses: CalendarBusinessDto[]
    google: GoogleConnectionDto | null
    /** Falha ao ler o Google (o resto do calendário continua). */
    googleError: string | null
    own: boolean
}

export type DeadlineConflictDto = DeadlineConflict & {
    /** Nomes dos negócios dos trabalhos sobrepostos. */
    businessNames: Record<string, string>
    /** Total de trabalhos sobrepostos; `overlap` vem vazio para quem não tem `works.view`. */
    overlapCount: number
    googleError: string | null
}

export interface GoogleSyncResultDto {
    published: number
    applied: number
    unlinked: number
    corrected: number
    errors: number
    connection: GoogleConnectionDto
}

export type { GoogleLinkKind }
