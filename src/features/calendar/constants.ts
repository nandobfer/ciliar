/** Constantes do Calendário (CIL-4; módulo PURO: tela e servidor). Ver `aicontext/modules/calendar.md`. */

export const CALENDAR_VIEWS = ["day", "week", "month"] as const
export type CalendarView = (typeof CALENDAR_VIEWS)[number]
export const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = { day: "Dia", week: "Semana", month: "Mês" }

/** Tipos de evento (também os filtros da tela; `availability` é o sombreamento do expediente). */
export const CALENDAR_EVENT_KINDS = ["work-deadline", "work-period", "order-deadline", "logged-hours", "google"] as const
export type CalendarEventKind = (typeof CALENDAR_EVENT_KINDS)[number]
export const CALENDAR_FILTERS = [...CALENDAR_EVENT_KINDS, "availability"] as const
export type CalendarFilter = (typeof CALENDAR_FILTERS)[number]
export const CALENDAR_FILTER_LABELS: Record<CalendarFilter, string> = {
    "work-deadline": "Prazos de trabalhos",
    "work-period": "Períodos de trabalhos",
    "order-deadline": "Prazos de pedidos abertos",
    "logged-hours": "Horas apontadas",
    google: "Eventos do Google",
    availability: "Expediente",
}

/** Preferências no navegador: visão e filtros, separadas para a página global e para cada negócio. */
export const CALENDAR_PREFS_KEY_OVERVIEW = "ciliar:calendar:overview"
export const calendarPrefsKey = (businessId: string | null) => (businessId ? `ciliar:calendar:business:${businessId}` : CALENDAR_PREFS_KEY_OVERVIEW)

/** Período máximo de uma consulta de eventos (dias). */
export const CALENDAR_MAX_RANGE_DAYS = 62

export const CALENDAR_AUDIT = "calendar.google"

// ── Google Agenda ─────────────────────────────────────────────────────────

/**
 * Escopos pedidos SÓ na conexão da agenda (o login continua só com o perfil). São escopos sensíveis:
 * sem verificação do app no Google Cloud, só usuários de teste conectam.
 */
export const GOOGLE_CALENDAR_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.calendarlist.readonly"] as const

export const GOOGLE_CONNECTION_STATUSES = ["active", "reauth", "choose_calendar", "error"] as const
export type GoogleConnectionStatus = (typeof GOOGLE_CONNECTION_STATUSES)[number]
export const GOOGLE_CONNECTION_STATUS_LABELS: Record<GoogleConnectionStatus, string> = {
    active: "Conectado",
    reauth: "Reconectar: o acesso foi revogado ou expirou",
    choose_calendar: "Escolha a agenda de publicação",
    error: "Falha na última sincronização",
}

/** Vínculos publicados: prazo e período do trabalho e prazo do pedido aberto. */
export const GOOGLE_LINK_KINDS = ["work-deadline", "work-period", "order-deadline"] as const
export type GoogleLinkKind = (typeof GOOGLE_LINK_KINDS)[number]

/** Validade do estado do OAuth (anti-CSRF + PKCE). */
export const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000
/** Renova o canal de notificação quando faltar menos do que isto. */
export const GOOGLE_CHANNEL_RENEW_BEFORE_MS = 24 * 60 * 60 * 1000
/** Backoff da cota (1 min, 2, 4… até 1 h). */
export const GOOGLE_BACKOFF_BASE_MS = 60 * 1000
export const GOOGLE_BACKOFF_MAX_MS = 60 * 60 * 1000
/** Cache curto dos eventos lidos do Google (por dono e período). */
export const GOOGLE_READ_CACHE_MS = 60 * 1000
export const GOOGLE_READ_CALENDARS_MAX = 20

/** Retorno do OAuth (cadastrar como URI de redirecionamento autorizado no cliente OAuth do login). */
export const GOOGLE_CALENDAR_CALLBACK_PATH = "/api/calendar/google/callback"
export const GOOGLE_CALENDAR_NOTIFY_PATH = "/api/public/calendar/google/notify"

/** Invalidação da conexão (estado, agendas) no canal do dono. */
export const CALENDAR_UPDATED_EVENT = "calendar-updated"
