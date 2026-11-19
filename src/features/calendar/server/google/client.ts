import { GOOGLE_CALENDAR_SCOPES } from "../../constants"

/**
 * Cliente REST mínimo do Google (OAuth + Calendar v3) por `fetch` — SOMENTE servidor, sem SDK. Usa o
 * mesmo cliente OAuth do login (`AUTH_GOOGLE_ID/SECRET`). Nenhuma mensagem de erro carrega token.
 */

const OAUTH_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth"
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token"
const OAUTH_REVOKE = "https://oauth2.googleapis.com/revoke"
const CALENDAR = "https://www.googleapis.com/calendar/v3"
const TIMEOUT_MS = 15_000

export type GoogleErrorKind = "auth" | "quota" | "not_found" | "gone" | "invalid" | "other"

/** Falha do Google classificada (sem segredos na mensagem). */
export class GoogleApiError extends Error {
    constructor(
        readonly kind: GoogleErrorKind,
        readonly status: number,
        readonly reason: string | null,
        message: string,
    ) {
        super(message)
        this.name = "GoogleApiError"
    }
}

export function googleOAuthConfigured(): boolean {
    return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)
}

function credentials(): { clientId: string; clientSecret: string } {
    const clientId = process.env.AUTH_GOOGLE_ID
    const clientSecret = process.env.AUTH_GOOGLE_SECRET
    if (!clientId || !clientSecret) throw new GoogleApiError("invalid", 503, "not_configured", "Login com Google não configurado (AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET).")
    return { clientId, clientSecret }
}

function classify(status: number, reason: string | null): GoogleErrorKind {
    if (status === 401 || reason === "invalid_grant" || reason === "authError") return "auth"
    if (status === 429 || reason === "rateLimitExceeded" || reason === "userRateLimitExceeded" || reason === "quotaExceeded") return "quota"
    if (status === 404) return "not_found"
    if (status === 410) return "gone"
    if (status === 403 && (reason === "insufficientPermissions" || reason === "forbidden")) return "auth"
    if (status === 400) return "invalid"
    return "other"
}

const MESSAGES: Record<GoogleErrorKind, string> = {
    auth: "O acesso ao Google Agenda foi revogado ou expirou: reconecte.",
    quota: "Cota do Google Agenda excedida: o Ciliar tenta de novo em instantes.",
    not_found: "Agenda ou evento não encontrado no Google.",
    gone: "A sincronização do Google precisa recomeçar.",
    invalid: "O Google recusou a solicitação.",
    other: "O Google Agenda não respondeu. Tente de novo.",
}

async function readError(response: Response): Promise<GoogleApiError> {
    const body = (await response.json().catch(() => null)) as { error?: string | { errors?: { reason?: string }[]; status?: string }; error_description?: string } | null
    const reason = typeof body?.error === "string" ? body.error : (body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? null)
    const kind = classify(response.status, reason)
    return new GoogleApiError(kind, response.status, reason, MESSAGES[kind])
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
    let response: Response
    try {
        response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch {
        throw new GoogleApiError("other", 0, "network", MESSAGES.other)
    }
    if (!response.ok) throw await readError(response)
    if (response.status === 204) return undefined as T
    return (await response.json().catch(() => ({}))) as T
}

// ── OAuth ───────────────────────────────────────────────────────────────────

export function authorizationUrl(input: { redirectUri: string; state: string; codeChallenge: string; loginHint?: string | null }): string {
    const { clientId } = credentials()
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: input.redirectUri,
        response_type: "code",
        scope: GOOGLE_CALENDAR_SCOPES.join(" "),
        access_type: "offline",
        // Sempre devolve o refresh token e deixa escolher outra conta Google.
        prompt: "consent select_account",
        include_granted_scopes: "true",
        state: input.state,
        code_challenge: input.codeChallenge,
        code_challenge_method: "S256",
    })
    if (input.loginHint) params.set("login_hint", input.loginHint)
    return `${OAUTH_AUTHORIZE}?${params.toString()}`
}

export interface GoogleTokenResponse {
    access_token: string
    expires_in: number
    refresh_token?: string
    scope?: string
    id_token?: string
}

export async function exchangeCode(input: { code: string; codeVerifier: string; redirectUri: string }): Promise<GoogleTokenResponse> {
    const { clientId, clientSecret } = credentials()
    return request<GoogleTokenResponse>(OAUTH_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: input.code, client_id: clientId, client_secret: clientSecret, redirect_uri: input.redirectUri, grant_type: "authorization_code", code_verifier: input.codeVerifier }).toString(),
    })
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
    const { clientId, clientSecret } = credentials()
    return request<GoogleTokenResponse>(OAUTH_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }).toString(),
    })
}

/** Revoga o acesso concedido (falha silenciosa: o token já pode ter sido revogado no Google). */
export async function revokeToken(token: string): Promise<void> {
    await request<unknown>(OAUTH_REVOKE, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString() }).catch(() => undefined)
}

/** E-mail da conta Google pelo `id_token` (só a carga útil, o token veio direto do Google por TLS). */
export function emailFromIdToken(idToken: string | undefined): string | null {
    if (!idToken) return null
    try {
        const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: unknown }
        return typeof payload.email === "string" ? payload.email : null
    } catch {
        return null
    }
}

// ── Calendar v3 ─────────────────────────────────────────────────────────────

export interface GoogleCalendarListEntry {
    id: string
    summary?: string
    summaryOverride?: string
    backgroundColor?: string
    primary?: boolean
    accessRole?: "freeBusyReader" | "reader" | "writer" | "owner"
    deleted?: boolean
}

export interface GoogleEventTime {
    date?: string | null
    dateTime?: string | null
    timeZone?: string | null
}

export interface GoogleEvent {
    id: string
    etag?: string
    status?: "confirmed" | "tentative" | "cancelled"
    summary?: string
    description?: string
    htmlLink?: string
    start?: GoogleEventTime
    end?: GoogleEventTime
    transparency?: "opaque" | "transparent"
    attendees?: { self?: boolean; responseStatus?: string }[]
    extendedProperties?: { private?: Record<string, string> }
    updated?: string
}

interface EventsPage {
    items?: GoogleEvent[]
    nextPageToken?: string
    nextSyncToken?: string
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })
const enc = encodeURIComponent

export const calendarApi = {
    async listCalendars(token: string): Promise<GoogleCalendarListEntry[]> {
        const out: GoogleCalendarListEntry[] = []
        let pageToken: string | undefined
        do {
            const params = new URLSearchParams({ maxResults: "250", ...(pageToken ? { pageToken } : {}) })
            const page = await request<{ items?: GoogleCalendarListEntry[]; nextPageToken?: string }>(`${CALENDAR}/users/me/calendarList?${params}`, { headers: bearer(token) })
            out.push(...(page.items ?? []).filter((item) => !item.deleted))
            pageToken = page.nextPageToken
        } while (pageToken)
        return out
    },

    /** Página de eventos (`syncToken` para a sincronização incremental; sem ele, a lista completa). */
    async listEvents(token: string, calendarId: string, params: Record<string, string>): Promise<EventsPage> {
        return request<EventsPage>(`${CALENDAR}/calendars/${enc(calendarId)}/events?${new URLSearchParams(params)}`, { headers: bearer(token) })
    },

    async insertEvent(token: string, calendarId: string, body: unknown): Promise<GoogleEvent> {
        return request<GoogleEvent>(`${CALENDAR}/calendars/${enc(calendarId)}/events`, { method: "POST", headers: { ...bearer(token), "Content-Type": "application/json" }, body: JSON.stringify(body) })
    },

    async patchEvent(token: string, calendarId: string, eventId: string, body: unknown): Promise<GoogleEvent> {
        return request<GoogleEvent>(`${CALENDAR}/calendars/${enc(calendarId)}/events/${enc(eventId)}`, { method: "PATCH", headers: { ...bearer(token), "Content-Type": "application/json" }, body: JSON.stringify(body) })
    },

    async watchEvents(token: string, calendarId: string, channel: { id: string; token: string; address: string; ttlSeconds: number }): Promise<{ id: string; resourceId: string; expiration?: string }> {
        return request(`${CALENDAR}/calendars/${enc(calendarId)}/events/watch`, {
            method: "POST",
            headers: { ...bearer(token), "Content-Type": "application/json" },
            body: JSON.stringify({ id: channel.id, type: "web_hook", address: channel.address, token: channel.token, params: { ttl: String(channel.ttlSeconds) } }),
        })
    },

    async stopChannel(token: string, channel: { id: string; resourceId: string }): Promise<void> {
        await request(`${CALENDAR}/channels/stop`, { method: "POST", headers: { ...bearer(token), "Content-Type": "application/json" }, body: JSON.stringify({ id: channel.id, resourceId: channel.resourceId }) })
    },
}
