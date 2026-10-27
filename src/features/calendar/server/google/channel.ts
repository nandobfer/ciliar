import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { DomainError } from "@/lib/api/route"
import { runAfterResponse } from "@/lib/after-response"
import { loggerFor } from "@/lib/logger"
import { appOrigin } from "@/features/auth/server/origin"
import { GOOGLE_CALENDAR_NOTIFY_PATH, GOOGLE_CHANNEL_RENEW_BEFORE_MS } from "../../constants"
import { calendarModels } from "../models"
import { calendarApi, GoogleApiError } from "./client"
import { accessTokenOf, recordGoogleFailure, type ConnectionDoc } from "./connection"
import { processPublishQueue } from "./publish"
import { syncConnection } from "./sync"

/**
 * Notificação push do Google (canal `events.watch` da agenda de publicação) — SOMENTE servidor. O
 * canal dura até 7 dias e é renovado pela rotina `calendar-google-sync`. A rota pública valida o
 * canal pelo token (hash SHA-256, comparação em tempo constante). Exige HTTPS público: em
 * desenvolvimento local o canal não é criado e a rotina periódica cobre.
 */

const log = loggerFor({ module: "calendar.google" })
const CHANNEL_TTL_SECONDS = 7 * 24 * 60 * 60
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

function notifyAddress(): string | null {
    try {
        const origin = appOrigin()
        return origin.startsWith("https://") ? `${origin}${GOOGLE_CALENDAR_NOTIFY_PATH}` : null
    } catch {
        return null
    }
}

/** Para o canal atual (falha silenciosa: ele expira sozinho). */
export async function stopChannel(connection: ConnectionDoc, token?: string): Promise<void> {
    if (!connection.channel) return
    try {
        await calendarApi.stopChannel(token ?? (await accessTokenOf(connection)), connection.channel)
    } catch {
        // O canal expira sozinho.
    }
    await calendarModels().connections.updateOne({ _id: connection._id }, { $set: { channel: null } })
}

/** Cria ou renova o canal da agenda de publicação. */
export async function ensureChannel(connection: ConnectionDoc, token: string): Promise<"ok" | "renewed" | "skipped"> {
    const calendarId = connection.publishCalendar?.id
    const address = notifyAddress()
    if (!calendarId || !address || connection.status !== "active") return "skipped"
    const channel = connection.channel
    if (channel && channel.calendarId === calendarId && new Date(channel.expiresAt).getTime() - Date.now() > GOOGLE_CHANNEL_RENEW_BEFORE_MS) return "ok"
    if (channel) await stopChannel(connection, token)
    const secret = randomBytes(32).toString("hex")
    const id = randomUUID()
    const created = await calendarApi.watchEvents(token, calendarId, { id, token: secret, address, ttlSeconds: CHANNEL_TTL_SECONDS })
    const expiresAt = created.expiration ? new Date(Number(created.expiration)) : new Date(Date.now() + CHANNEL_TTL_SECONDS * 1000)
    await calendarModels().connections.updateOne({ _id: connection._id }, { $set: { channel: { id, resourceId: created.resourceId, tokenHash: sha256(secret), calendarId, expiresAt } } })
    return "renewed"
}

/**
 * Renova o canal dentro das rotinas (cron e "Sincronizar agora"). Falha no token = falha da conexão
 * (`recordGoogleFailure`, pode pedir reconexão) e interrompe; falha só no `events.watch` (ex.: domínio
 * não registrado no Google Cloud, 401 `push.webhookUrlUnauthorized`) NÃO é fatal: fica no log e a
 * sincronização segue, coberta pela rotina de 15 min.
 */
export async function renewChannelSafely(connection: ConnectionDoc): Promise<"ok" | "renewed" | "skipped" | "watch_failed" | "token_failed"> {
    let token: string
    try {
        token = await accessTokenOf(connection)
    } catch (error) {
        await recordGoogleFailure(connection, error, { publishCalendar: true })
        return "token_failed"
    }
    try {
        return await ensureChannel(connection, token)
    } catch (error) {
        const google = error instanceof GoogleApiError ? error : null
        log.warn({ ownerId: connection.ownerId, status: google?.status ?? null, reason: google?.reason ?? null }, "[calendar] Falha ao criar o canal de notificação; a rotina cobre a sincronização")
        return "watch_failed"
    }
}

const channelNotFound = () => new DomainError(404, "Canal não encontrado", "NOT_FOUND")

/**
 * `POST /api/public/calendar/google/notify`: o Google avisa que a agenda mudou. Só invalida e
 * agenda a sincronização depois da resposta (o conteúdo vem da API do Google, nunca do aviso).
 */
export async function handleGoogleNotification(headers: Headers, options: { onVerified?: (channelId: string) => void } = {}): Promise<{ state: string }> {
    const channelId = headers.get("x-goog-channel-id")
    const token = headers.get("x-goog-channel-token")
    const state = headers.get("x-goog-resource-state") ?? "exists"
    if (!channelId || !token || channelId.length > 100 || token.length > 256) throw channelNotFound()
    const connection = await calendarModels().connections.findOne({ "channel.id": channelId }).lean<ConnectionDoc>()
    if (!connection?.channel) throw channelNotFound()
    const expected = Buffer.from(connection.channel.tokenHash, "hex")
    const received = Buffer.from(sha256(token), "hex")
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw channelNotFound()
    // O limitador só conta canais já validados: cabeçalhos inventados nunca ocupam o limitador compartilhado.
    options.onVerified?.(channelId)
    if (state !== "sync") {
        const ownerId = connection.ownerId
        runAfterResponse("calendar-google-notify", async () => {
            await syncConnection(ownerId)
            await processPublishQueue(ownerId)
        })
    }
    log.debug({ ownerId: connection.ownerId, state }, "[calendar] Notificação do Google")
    return { state }
}
