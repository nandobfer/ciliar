import { createHash, randomBytes } from "node:crypto"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { encryptSecret, decryptSecret } from "@/lib/crypto/secretBox"
import { normalizeTimeZone } from "@/lib/timezone"
import { parseInput } from "@/features/access/server/commands"
import { denied, resolveAccess } from "@/features/access/server/access"
import type { AccessContext } from "@/features/access/server/context"
import { can } from "@/features/access/catalog"
import { appOrigin } from "@/features/auth/server/origin"
import { auditBusiness, businessOwnerOf } from "@/features/businesses/server/access"
import { CALENDAR_AUDIT, GOOGLE_CALENDAR_CALLBACK_PATH, GOOGLE_OAUTH_STATE_TTL_MS } from "../../constants"
import { googleConnectSchema, googleRepublishSchema, googleSettingsSchema } from "../../schemas"
import type { GoogleCalendarItemDto, GoogleConnectionDto, GoogleSyncResultDto } from "../../types"
import { calendarModels } from "../models"
import { authorizationUrl, calendarApi, emailFromIdToken, exchangeCode, GoogleApiError, googleOAuthConfigured, revokeToken } from "./client"
import { accessTokenOf, connectionDto, loadConnection, publishCalendarChanged, recordGoogleFailure, type ConnectionDoc } from "./connection"
import { ensureChannel, stopChannel } from "./channel"
import { markCalendarDirty, processPublishQueue, seedCalendarLinks } from "./publish"
import { clearGoogleReadCache } from "./read"
import { syncConnection } from "./sync"

/**
 * Google Agenda do Calendário (CIL-4) — SOMENTE servidor. Opcional. Conectar, escolher as agendas,
 * sincronizar, republicar e desconectar exigem só `calendar.view` (+ `businesses.use`) e agem sobre o
 * dono efetivo (`businessOwnerOf`): na simulação de usuário, a conta Google conectada fica ligada ao
 * alvo (risco registrado na documentação) e a auditoria guarda o ator real com a simulação.
 *
 * O "Visualizar como" é um cabeçalho por aba e o retorno do Google é uma navegação sem ele: o estado do
 * OAuth guarda o ator real, o dono, o cabeçalho e o verificador PKCE; o retorno confere a sessão.
 */

const REQUIRED_SCOPE = "https://www.googleapis.com/auth/calendar.events"
const base64url = (buffer: Buffer) => buffer.toString("base64url")
const sha256 = (value: string) => createHash("sha256").update(value).digest()

function requireCalendar(access: AccessContext): void {
    if (!can(access.effective, "businesses.use") || !can(access.effective, "calendar.view")) throw denied("Seu perfil não permite usar o Calendário (calendar.view).")
}

const redirectUri = () => `${appOrigin()}${GOOGLE_CALENDAR_CALLBACK_PATH}`

/** Destino interno seguro depois do retorno (`/calendario` por padrão). */
export function safeReturnTo(value: string | null | undefined): string {
    if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) return "/calendario"
    return value.startsWith("/calendario") || /^\/negocios\/[a-f\d]{24}\/calendario$/i.test(value) ? value : "/calendario"
}

export async function getGoogleConnection(access: AccessContext): Promise<GoogleConnectionDto> {
    requireCalendar(access)
    await dbConnect()
    return connectionDto(businessOwnerOf(access))
}

/** Início da conexão: devolve a URL do Google (o navegador navega até ela). */
export async function startGoogleConnect(access: AccessContext, raw: unknown): Promise<{ url: string }> {
    requireCalendar(access)
    if (!googleOAuthConfigured()) throw new DomainError(503, "Login com Google não configurado no servidor (AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET).", "GOOGLE_NOT_CONFIGURED")
    const input = parseInput(googleConnectSchema, raw ?? {})
    await dbConnect()
    const state = base64url(randomBytes(32))
    const codeVerifier = base64url(randomBytes(48))
    await calendarModels().oauthStates.create({
        stateHash: sha256(state).toString("hex"),
        realActorId: access.userId,
        ownerId: businessOwnerOf(access),
        viewAsHeader: access.viewAsHeader || "none",
        codeVerifier,
        returnTo: safeReturnTo(input.returnTo),
        timeZone: normalizeTimeZone(access.timeZone),
    })
    return { url: authorizationUrl({ redirectUri: redirectUri(), state, codeChallenge: base64url(sha256(codeVerifier)) }) }
}

export interface ConnectCallback {
    state: string | null
    code: string | null
    error: string | null
}

/**
 * Retorno do Google (`GET /api/calendar/google/callback`). Confere o estado (uso único, 10 min), a
 * sessão (o mesmo ator real), a simulação guardada e as permissões; troca o código pelo token e grava
 * a conexão cifrada. Devolve o destino e o resultado para a tela.
 */
export async function finishGoogleConnect(session: { userId: string; sessionVersion: number }, params: ConnectCallback): Promise<{ returnTo: string; result: "connected" | "cancelled" | "error"; message?: string }> {
    await dbConnect()
    if (!params.state) return { returnTo: "/calendario", result: "error", message: "Retorno do Google sem estado." }
    const state = await calendarModels().oauthStates.findOneAndDelete({ stateHash: sha256(params.state).toString("hex") }).lean()
    if (!state || Date.now() - new Date(state.createdAt).getTime() > GOOGLE_OAUTH_STATE_TTL_MS) return { returnTo: "/calendario", result: "error", message: "A conexão expirou. Tente de novo." }
    const returnTo = safeReturnTo(state.returnTo)
    if (state.realActorId !== session.userId) return { returnTo, result: "error", message: "A conexão foi iniciada por outra sessão." }
    if (params.error || !params.code) return { returnTo, result: "cancelled" }
    const access = await resolveAccess(session.userId, state.viewAsHeader, null, session.sessionVersion)
    if (access.legalAcceptanceRequired) return { returnTo, result: "error", message: "Aceite os termos de uso para continuar." }
    if (businessOwnerOf(access) !== state.ownerId) return { returnTo, result: "error", message: "A simulação mudou durante a conexão. Tente de novo." }
    try {
        requireCalendar(access)
    } catch {
        return { returnTo, result: "error", message: "Seu perfil não permite usar o Calendário." }
    }
    let tokens
    try {
        tokens = await exchangeCode({ code: params.code, codeVerifier: state.codeVerifier, redirectUri: redirectUri() })
    } catch (error) {
        return { returnTo, result: "error", message: error instanceof GoogleApiError ? "O Google recusou a conexão. Tente de novo." : "Falha ao conectar com o Google." }
    }
    const scopes = (tokens.scope ?? "").split(" ").filter(Boolean)
    if (!scopes.includes(REQUIRED_SCOPE)) {
        await revokeToken(tokens.refresh_token ?? tokens.access_token)
        return { returnTo, result: "error", message: "Permita o acesso aos eventos da agenda para conectar." }
    }
    const ownerId = state.ownerId
    const models = calendarModels()
    const existing = await loadConnection(ownerId)
    const refresh = tokens.refresh_token ?? (existing ? decryptSecret(existing.refreshTokenBox) : null)
    if (!refresh) return { returnTo, result: "error", message: "O Google não devolveu o acesso permanente. Remova o Ciliar em myaccount.google.com/permissions e conecte de novo." }
    const googleEmail = emailFromIdToken(tokens.id_token)
    const sameAccount = existing && existing.googleEmail && existing.googleEmail === googleEmail
    if (existing && !sameAccount) {
        await stopChannel(existing).catch(() => undefined)
        await models.links.deleteMany({ ownerId })
    }
    const set: Record<string, unknown> = {
        ownerId,
        googleEmail,
        scopes,
        refreshTokenBox: encryptSecret(refresh),
        accessTokenBox: encryptSecret(tokens.access_token),
        accessTokenExpiresAt: new Date(Date.now() + Math.max(60, tokens.expires_in ?? 3600) * 1000),
        lastError: null,
        backoffUntil: null,
        backoffStep: 0,
        timeZone: state.timeZone,
        connectedBy: access.userId,
    }
    if (sameAccount) set.status = existing.publishCalendar ? "active" : "choose_calendar"
    else Object.assign(set, { status: "choose_calendar", publishCalendar: null, readCalendars: [], syncToken: null, channel: null })
    await models.connections.updateOne({ ownerId }, { $set: set, $inc: { version: 1 } }, { upsert: true })
    await auditBusiness(access, `${CALENDAR_AUDIT}.connect`, ownerId, existing ? { googleEmail: existing.googleEmail } : null, { googleEmail, reconnect: Boolean(sameAccount) })
    clearGoogleReadCache(ownerId)
    await publishCalendarChanged(ownerId)
    return { returnTo, result: "connected" }
}

async function activeConnection(access: AccessContext): Promise<ConnectionDoc> {
    requireCalendar(access)
    await dbConnect()
    const connection = await loadConnection(businessOwnerOf(access))
    if (!connection) throw new DomainError(404, "O Google Agenda não está conectado.", "GOOGLE_NOT_CONNECTED")
    if (connection.status === "reauth") throw new DomainError(409, "Reconecte o Google Agenda: o acesso foi revogado ou expirou.", "GOOGLE_REAUTH_REQUIRED")
    return connection
}

/** Agendas da conta conectada (para escolher a de publicação e as lidas). */
export async function listGoogleCalendars(access: AccessContext): Promise<GoogleCalendarItemDto[]> {
    const connection = await activeConnection(access)
    try {
        const items = await calendarApi.listCalendars(await accessTokenOf(connection))
        return items.map((item) => ({ id: item.id, name: item.summaryOverride || item.summary || item.id, color: item.backgroundColor ?? null, primary: Boolean(item.primary), writable: item.accessRole === "owner" || item.accessRole === "writer" }))
    } catch (error) {
        throw new DomainError(502, await recordGoogleFailure(connection, error), "GOOGLE_UNAVAILABLE")
    }
}

/** Agenda de publicação e agendas lidas. Trocar a de publicação republica tudo nela (os eventos antigos ficam como histórico). */
export async function updateGoogleSettings(access: AccessContext, raw: unknown): Promise<GoogleConnectionDto> {
    const input = parseInput(googleSettingsSchema, raw)
    const connection = await activeConnection(access)
    const ownerId = connection.ownerId
    const calendars = await listGoogleCalendars(access)
    const byId = new Map(calendars.map((calendar) => [calendar.id, calendar]))
    const set: Record<string, unknown> = {}
    let publishChanged = false
    if (input.publishCalendarId !== undefined) {
        if (input.publishCalendarId === null) {
            set.publishCalendar = null
            set.status = "choose_calendar"
        } else {
            const calendar = byId.get(input.publishCalendarId)
            if (!calendar) throw new DomainError(400, "Agenda não encontrada na conta Google.", "GOOGLE_CALENDAR_NOT_FOUND")
            if (!calendar.writable) throw new DomainError(400, "Escolha uma agenda em que você pode criar eventos.", "GOOGLE_CALENDAR_READ_ONLY")
            set.publishCalendar = { id: calendar.id, name: calendar.name, color: calendar.color }
            set.status = "active"
        }
        publishChanged = (connection.publishCalendar?.id ?? null) !== (input.publishCalendarId ?? null)
        if (publishChanged) set.syncToken = null
    }
    if (input.readCalendarIds !== undefined) {
        const missing = input.readCalendarIds.filter((id) => !byId.has(id))
        if (missing.length) throw new DomainError(400, "Uma das agendas marcadas não existe mais na conta Google.", "GOOGLE_CALENDAR_NOT_FOUND")
        set.readCalendars = [...new Set(input.readCalendarIds)].map((id) => ({ id, name: byId.get(id)!.name, color: byId.get(id)!.color }))
    }
    if (publishChanged && connection.channel) await stopChannel(connection)
    await calendarModels().connections.updateOne({ _id: connection._id }, { $set: set, $inc: { version: 1 } })
    await auditBusiness(
        access,
        `${CALENDAR_AUDIT}.settings`,
        ownerId,
        { publishCalendar: connection.publishCalendar?.name ?? null, readCalendars: (connection.readCalendars ?? []).map((calendar) => calendar.name) },
        { publishCalendar: (set.publishCalendar as { name: string } | null | undefined)?.name ?? connection.publishCalendar?.name ?? null, readCalendars: ((set.readCalendars as { name: string }[] | undefined) ?? connection.readCalendars ?? []).map((calendar) => calendar.name) },
    )
    clearGoogleReadCache(ownerId)
    if (publishChanged && input.publishCalendarId) {
        // Nova agenda: todos os vínculos voltam para a fila e são criados nela.
        await calendarModels().links.updateMany({ ownerId, status: "linked" }, { $set: { dirty: true, attempts: 0, nextAttemptAt: null } })
        await seedCalendarLinks(ownerId)
        const fresh = await loadConnection(ownerId)
        if (fresh) {
            try {
                await ensureChannel(fresh, await accessTokenOf(fresh))
            } catch (error) {
                await recordGoogleFailure(fresh, error, { publishCalendar: true })
            }
            await processPublishQueue(ownerId, { connection: fresh })
        }
    }
    await publishCalendarChanged(ownerId)
    return connectionDto(ownerId)
}

/** "Sincronizar agora": volta do Google, publica a fila e renova o canal. */
export async function syncGoogleNow(access: AccessContext): Promise<GoogleSyncResultDto> {
    const connection = await activeConnection(access)
    const ownerId = connection.ownerId
    if (connection.status !== "active") throw new DomainError(409, connection.status === "choose_calendar" ? "Escolha a agenda de publicação." : (connection.lastError ?? "Google Agenda indisponível."), "GOOGLE_NOT_READY")
    // "Sincronizar agora" ignora a espera da cota uma vez (o próprio Google responde se ainda estiver acima).
    if (connection.backoffUntil) await calendarModels().connections.updateOne({ _id: connection._id }, { $set: { backoffUntil: null } })
    const fresh = (await loadConnection(ownerId))!
    if (connection.timeZone !== normalizeTimeZone(access.timeZone)) await calendarModels().connections.updateOne({ _id: connection._id }, { $set: { timeZone: normalizeTimeZone(access.timeZone) } })
    try {
        await ensureChannel(fresh, await accessTokenOf(fresh))
    } catch (error) {
        await recordGoogleFailure(fresh, error, { publishCalendar: true })
    }
    const synced = await syncConnection(ownerId)
    await seedCalendarLinks(ownerId)
    const published = await processPublishQueue(ownerId)
    clearGoogleReadCache(ownerId)
    await auditBusiness(access, `${CALENDAR_AUDIT}.sync`, ownerId, null, { applied: synced.applied, unlinked: synced.unlinked + published.unlinked, corrected: synced.corrected, published: published.published, errors: synced.errors + published.errors })
    return { published: published.published, applied: synced.applied, unlinked: synced.unlinked + published.unlinked, corrected: synced.corrected, errors: synced.errors + published.errors, connection: await connectionDto(ownerId) }
}

/** "Republicar": recria o evento excluído no Google (um item ou todos). */
export async function republishGoogle(access: AccessContext, raw: unknown): Promise<GoogleConnectionDto> {
    const input = parseInput(googleRepublishSchema, raw)
    const connection = await activeConnection(access)
    const ownerId = connection.ownerId
    const links = calendarModels().links
    const reset = { status: "linked", unlinkedReason: null, eventId: null, etag: null, pushedHash: null, dirty: true, attempts: 0, nextAttemptAt: null }
    let count = 0
    if ("all" in input) count = (await links.updateMany({ ownerId, status: "unlinked", unlinkedReason: "deleted_in_google" }, { $set: reset })).modifiedCount
    else {
        const existing = await links.findOne({ ownerId, kind: input.kind, refId: input.id }).lean()
        if (existing) count = (await links.updateOne({ _id: existing._id }, { $set: reset })).modifiedCount
        else {
            const { orderModels } = await import("@/features/orders/server/models")
            const { workModels } = await import("@/features/works/server/models")
            const item = input.kind === "order-deadline" ? await orderModels().orders.findOne({ _id: input.id, ownerId }).select({ businessId: 1 }).lean() : await workModels().works.findOne({ _id: input.id, ownerId }).select({ businessId: 1 }).lean()
            if (!item) throw new DomainError(404, "Item não encontrado", "NOT_FOUND")
            await markCalendarDirty(ownerId, { businessId: item.businessId, ...(input.kind === "order-deadline" ? { orderId: input.id } : { workId: input.id }) }, { run: false })
            count = 1
        }
    }
    await auditBusiness(access, `${CALENDAR_AUDIT}.republish`, ownerId, null, "all" in input ? { all: true, count } : { kind: input.kind, id: input.id })
    await processPublishQueue(ownerId)
    await publishCalendarChanged(ownerId)
    return connectionDto(ownerId)
}

/** Desconectar: para o canal, revoga o acesso e apaga os tokens e os vínculos (os eventos ficam no Google). */
export async function disconnectGoogle(access: AccessContext): Promise<GoogleConnectionDto> {
    requireCalendar(access)
    await dbConnect()
    const ownerId = businessOwnerOf(access)
    const connection = await loadConnection(ownerId)
    if (!connection) return connectionDto(ownerId)
    await stopChannel(connection).catch(() => undefined)
    try {
        await revokeToken(decryptSecret(connection.refreshTokenBox))
    } catch {
        // Revogado/indecifrável: os tokens são apagados mesmo assim.
    }
    const models = calendarModels()
    await models.connections.deleteOne({ _id: connection._id })
    await models.links.deleteMany({ ownerId })
    clearGoogleReadCache(ownerId)
    await auditBusiness(access, `${CALENDAR_AUDIT}.disconnect`, ownerId, { googleEmail: connection.googleEmail }, null)
    await publishCalendarChanged(ownerId)
    return connectionDto(ownerId)
}
