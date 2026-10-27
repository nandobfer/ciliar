import type { Types } from "mongoose"
import { decryptSecret, encryptSecret } from "@/lib/crypto/secretBox"
import { loggerFor } from "@/lib/logger"
import { publishToChannels } from "@/lib/pusher/channels"
import { businessesChannel } from "@/lib/pusher/channel-names"
import { CALENDAR_UPDATED_EVENT, GOOGLE_BACKOFF_BASE_MS, GOOGLE_BACKOFF_MAX_MS } from "../../constants"
import type { GoogleConnectionDto } from "../../types"
import { calendarModels, type GoogleConnectionRecord } from "../models"
import { GoogleApiError, googleOAuthConfigured, refreshAccessToken } from "./client"

/**
 * Conexão Google do dono efetivo — SOMENTE servidor. Tokens cifrados (AES-256-GCM) e nunca devolvidos;
 * o access token é renovado pelo refresh token quando falta menos de 1 min. As falhas mudam o estado:
 * `auth` → reconectar; cota → espera crescente (`backoffUntil`); agenda de publicação sumiu → escolher outra.
 */

export type ConnectionDoc = GoogleConnectionRecord & { _id: Types.ObjectId }

const log = loggerFor({ module: "calendar.google" })

export async function loadConnection(ownerId: string): Promise<ConnectionDoc | null> {
    return calendarModels().connections.findOne({ ownerId }).lean<ConnectionDoc>()
}

/** Só invalidação no canal do dono (estado da conexão e agendas). */
export async function publishCalendarChanged(ownerId: string): Promise<void> {
    await publishToChannels([businessesChannel(ownerId)], CALENDAR_UPDATED_EVENT, {}).catch(() => undefined)
}

/** Access token válido (renova e grava cifrado). */
export async function accessTokenOf(connection: ConnectionDoc): Promise<string> {
    if (connection.accessTokenBox && connection.accessTokenExpiresAt && new Date(connection.accessTokenExpiresAt).getTime() - Date.now() > 60_000) {
        return decryptSecret(connection.accessTokenBox)
    }
    const fresh = await refreshAccessToken(decryptSecret(connection.refreshTokenBox))
    const expiresAt = new Date(Date.now() + Math.max(60, fresh.expires_in ?? 3600) * 1000)
    const set: Record<string, unknown> = { accessTokenBox: encryptSecret(fresh.access_token), accessTokenExpiresAt: expiresAt }
    if (fresh.refresh_token) set.refreshTokenBox = encryptSecret(fresh.refresh_token)
    await calendarModels().connections.updateOne({ _id: connection._id }, { $set: set })
    return fresh.access_token
}

/** A conexão está em espera pela cota? */
export const inBackoff = (connection: Pick<ConnectionDoc, "backoffUntil">, now = Date.now()) => Boolean(connection.backoffUntil && new Date(connection.backoffUntil).getTime() > now)

export const backoffDelay = (step: number) => Math.min(GOOGLE_BACKOFF_MAX_MS, GOOGLE_BACKOFF_BASE_MS * 2 ** Math.max(0, step))

/**
 * Registra a falha do Google na conexão e devolve a mensagem para a tela. `publishCalendar`: a falha
 * "não encontrado" foi na agenda de publicação (pede outra).
 */
export async function recordGoogleFailure(connection: ConnectionDoc, error: unknown, context: { publishCalendar?: boolean } = {}): Promise<string> {
    const google = error instanceof GoogleApiError ? error : null
    const message = google?.message ?? "Falha ao falar com o Google Agenda."
    const set: Record<string, unknown> = { lastError: message }
    if (google?.kind === "auth") set.status = "reauth"
    else if (google?.kind === "quota") {
        set.backoffUntil = new Date(Date.now() + backoffDelay(connection.backoffStep ?? 0))
        set.backoffStep = (connection.backoffStep ?? 0) + 1
    } else if (google?.kind === "not_found" && context.publishCalendar) set.status = "choose_calendar"
    else if (!google || google.kind === "other") set.status = connection.status === "active" ? "error" : connection.status
    await calendarModels().connections.updateOne({ _id: connection._id }, { $set: set })
    log.warn({ ownerId: connection.ownerId, kind: google?.kind ?? "unknown", status: google?.status ?? null, reason: google?.reason ?? null }, "[calendar] Falha do Google Agenda")
    await publishCalendarChanged(connection.ownerId)
    return message
}

/** Sucesso: limpa a espera e o erro (volta a `active` se estava em erro passageiro). */
export async function recordGoogleSuccess(connection: ConnectionDoc, extra: Record<string, unknown> = {}): Promise<void> {
    if (!connection.lastError && !connection.backoffUntil && connection.status !== "error" && !Object.keys(extra).length) return
    const set: Record<string, unknown> = { backoffUntil: null, backoffStep: 0, lastError: null, ...extra }
    if (connection.status === "error") set.status = "active"
    await calendarModels().connections.updateOne({ _id: connection._id }, { $set: set })
}

export async function connectionDto(ownerId: string): Promise<GoogleConnectionDto> {
    const connection = await loadConnection(ownerId)
    if (!connection) {
        return { connected: false, configured: googleOAuthConfigured(), status: null, googleEmail: null, publishCalendarId: null, publishCalendarName: null, readCalendars: [], lastSyncAt: null, lastError: null, backoffUntil: null, pendingLinks: 0, unlinked: 0 }
    }
    const links = calendarModels().links
    const [pendingLinks, unlinked] = await Promise.all([links.countDocuments({ ownerId, status: "linked", dirty: true }), links.countDocuments({ ownerId, status: "unlinked", unlinkedReason: "deleted_in_google" })])
    return {
        connected: true,
        configured: googleOAuthConfigured(),
        status: connection.status,
        googleEmail: connection.googleEmail ?? null,
        publishCalendarId: connection.publishCalendar?.id ?? null,
        publishCalendarName: connection.publishCalendar?.name ?? null,
        readCalendars: (connection.readCalendars ?? []).map((calendar) => ({ id: calendar.id, name: calendar.name, color: calendar.color ?? null })),
        lastSyncAt: connection.lastSyncAt ? new Date(connection.lastSyncAt).toISOString() : null,
        lastError: connection.lastError ?? null,
        backoffUntil: connection.backoffUntil && inBackoff(connection) ? new Date(connection.backoffUntil).toISOString() : null,
        pendingLinks,
        unlinked,
    }
}
