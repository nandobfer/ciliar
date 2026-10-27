import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server-core"

vi.mock("@/lib/db", async (original) => ({ ...(await original<object>()), dbConnect: vi.fn(async () => undefined) }))
vi.mock("ai", () => ({ dynamicTool: (def: unknown) => def }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined), integrationChannel: (id: string) => `private-integration-${id}` }))
vi.mock("@/lib/after-response", () => ({ runAfterResponse: vi.fn() }))
vi.mock("@/lib/email/mailer", () => ({ isMockMode: vi.fn(async () => true), sendEmail: vi.fn() }))

import { runAfterResponse } from "@/lib/after-response"
import { todayKeyIn } from "@/lib/timezone"
import { BUSINESS_FULL_PERMISSIONS } from "@/features/businesses/permissions"
import { accessModels } from "@/features/access/server/models"
import { createRole } from "@/features/access/server/commands"
import { resolveAccess } from "@/features/access/server/access"
import type { AccessContext } from "@/features/access/server/context"
import { businessModels } from "@/features/businesses/server/models"
import { createActivity } from "@/features/businesses/server/activities"
import { platformModels } from "@/features/platform/server/models"
import { addDaysToKey } from "@/features/orders/logic"
import { orderModels } from "@/features/orders/server/models"
import { createClient } from "@/features/orders/server/clients"
import { acceptOrder, cancelOrder, createOrder, getOrder, sendOrder } from "@/features/orders/server/orders"
import { workModels } from "@/features/works/server/models"
import { getWork, updateWork } from "@/features/works/server/works"
import { calendarModels } from "@/features/calendar/server/models"
import { listCalendarEvents } from "@/features/calendar/server/range"
import { checkDeadlineConflict } from "@/features/calendar/server/conflict"
import { disconnectGoogle, finishGoogleConnect, getGoogleConnection, listGoogleCalendars, republishGoogle, startGoogleConnect, syncGoogleNow, updateGoogleSettings } from "@/features/calendar/server/google/service"
import { processPublishQueue } from "@/features/calendar/server/google/publish"
import { syncConnection } from "@/features/calendar/server/google/sync"
import { ensureChannel, handleGoogleNotification } from "@/features/calendar/server/google/channel"
import { accessTokenOf, loadConnection } from "@/features/calendar/server/google/connection"
import { clearGoogleReadCache } from "@/features/calendar/server/google/read"

const TZ = "America/Sao_Paulo"
const PUBLISH = "publica@group.calendar.google.com"
const TEAM = "equipe@group.calendar.google.com"

// ── Google simulado ─────────────────────────────────────────────────────────
interface FakeEvent { id: string; etag: string; status?: string; summary?: string; description?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string }; transparency?: string; extendedProperties?: { private?: Record<string, string> } }
const google = {
    seq: 0,
    calendars: new Map<string, Map<string, FakeEvent>>(),
    changes: [] as { seq: number; calendarId: string; eventId: string }[],
    failNext: null as null | { match: RegExp; status: number; body: unknown },
    refreshFails: false,
    requests: [] as string[],
    reset() {
        this.seq = 0
        this.calendars = new Map([[PUBLISH, new Map()], [TEAM, new Map()]])
        this.changes = []
        this.failNext = null
        this.refreshFails = false
        this.requests = []
    },
    touch(calendarId: string, event: FakeEvent) {
        this.seq += 1
        event.etag = `"e${this.seq}"`
        this.calendars.get(calendarId)!.set(event.id, event)
        this.changes.push({ seq: this.seq, calendarId, eventId: event.id })
    },
    /** O usuário mexe no evento pelo Google. */
    userEdit(calendarId: string, eventId: string, patch: Partial<FakeEvent>) {
        const current = this.calendars.get(calendarId)!.get(eventId)!
        this.touch(calendarId, { ...current, ...patch })
    },
    events(calendarId: string) {
        return [...this.calendars.get(calendarId)!.values()]
    },
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.y`

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    const method = init?.method ?? "GET"
    google.requests.push(`${method} ${url.pathname}`)
    if (google.failNext && google.failNext.match.test(`${method} ${url.pathname}`)) {
        const fail = google.failNext
        google.failNext = null
        return json(fail.body, fail.status)
    }
    if (url.hostname === "oauth2.googleapis.com" && url.pathname === "/token") {
        const body = new URLSearchParams(String(init?.body))
        if (body.get("grant_type") === "refresh_token") return google.refreshFails ? json({ error: "invalid_grant" }, 400) : json({ access_token: "access-2", expires_in: 3600 })
        return json({ access_token: "access-1", refresh_token: "refresh-secret-1", expires_in: 3600, scope: "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly", id_token: idToken("ana@gmail.test") })
    }
    if (url.pathname === "/revoke") return json({})
    const path = url.pathname.replace("/calendar/v3", "")
    if (path === "/users/me/calendarList") return json({ items: [{ id: PUBLISH, summary: "Trabalho", accessRole: "owner", backgroundColor: "#00f" }, { id: TEAM, summary: "Equipe", accessRole: "reader", backgroundColor: "#0f0" }] })
    if (path === "/channels/stop") return new Response(null, { status: 204 })
    const match = /^\/calendars\/([^/]+)\/events(?:\/(watch|[^/]+))?$/.exec(path)
    if (match) {
        const calendarId = decodeURIComponent(match[1]!)
        const tail = match[2] ? decodeURIComponent(match[2]) : null
        const calendar = google.calendars.get(calendarId)
        if (!calendar) return json({ error: { errors: [{ reason: "notFound" }] } }, 404)
        if (tail === "watch") return json({ id: JSON.parse(String(init?.body)).id, resourceId: "res-1", expiration: String(Date.now() + 7 * 86_400_000) })
        if (method === "POST") {
            const body = JSON.parse(String(init?.body)) as FakeEvent
            const event = { ...body, id: `ev${google.seq + 1}`, etag: "", status: "confirmed" }
            google.touch(calendarId, event)
            return json(event)
        }
        if (method === "PATCH" && tail) {
            const current = calendar.get(tail)
            if (!current || current.status === "cancelled") return json({ error: { errors: [{ reason: "notFound" }] } }, 404)
            const updated = { ...current, ...(JSON.parse(String(init?.body)) as FakeEvent) }
            google.touch(calendarId, updated)
            return json(updated)
        }
        if (method === "GET") {
            const syncToken = url.searchParams.get("syncToken")
            if (syncToken) {
                const since = Number(syncToken)
                const ids = [...new Set(google.changes.filter((change) => change.calendarId === calendarId && change.seq > since).map((change) => change.eventId))]
                return json({ items: ids.map((id) => calendar.get(id)!), nextSyncToken: String(google.seq) })
            }
            const timeMin = url.searchParams.get("timeMin")
            const items = [...calendar.values()].filter((event) => !timeMin || event.status !== "cancelled")
            return json({ items, nextSyncToken: String(google.seq) })
        }
    }
    return json({ error: "unexpected" }, 500)
}

// ── Banco ───────────────────────────────────────────────────────────────────
let replica: MongoMemoryReplSet
let admin: AccessContext
let ana: AccessContext
let businessId: string
let clientId: string
let activityId: string
const access = accessModels()
const businesses = businessModels()
const orders = orderModels()
const works = workModels()
const platform = platformModels()
const calendar = calendarModels()
const all = () => [...Object.values(access), ...Object.values(businesses), ...Object.values(orders), ...Object.values(works), ...Object.values(platform), ...Object.values(calendar)]
const day = (offset: number) => addDaysToKey(todayKeyIn(TZ), offset)

beforeAll(async () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "calendar-google-tests-only-key"
    process.env.AUTH_GOOGLE_ID = "client-id.apps.googleusercontent.com"
    process.env.AUTH_GOOGLE_SECRET = "client-secret"
    process.env.APP_ORIGIN = "http://localhost:3101"
    vi.stubGlobal("fetch", vi.fn(fakeFetch))
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.18" }, replSet: { count: 1 }, instanceOpts: [{ ip: "127.0.0.1" }] })
    await mongoose.connect(replica.getUri("ciliar_calendar_google_test"))
    await Promise.all(all().map((model) => model.init()))
}, 120_000)
beforeEach(async () => {
    google.reset()
    clearGoogleReadCache()
    vi.mocked(runAfterResponse).mockClear()
    process.env.APP_ORIGIN = "http://localhost:3101"
    await Promise.all(all().map((model) => model.deleteMany({})))
    const role = await access.roles.create({ slug: "admin", nome: "Administrador", permissoes: ["*"], ativo: true })
    const actor = await access.users.create({ name: "Admin", email: "admin@example.test", active: true, roles: [role.id] })
    admin = { ...(await resolveAccess(actor.id as string)), timeZone: TZ }
    const provider = await createRole(admin, { nome: "Prestador", descricao: "", cor: "azul", ativo: true, permissoes: [...BUSINESS_FULL_PERMISSIONS], limiteNegocios: null })
    const a = await access.users.create({ name: "Ana", email: "ana@example.test", active: true, roles: [provider.id] })
    ana = { ...(await resolveAccess(a.id as string)), timeZone: TZ }
    businessId = (await businesses.businesses.create({ ownerId: ana.userId, number: 1, name: "Studio", availability: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: null, end: null })), createdBy: ana.userId, updatedBy: ana.userId }))._id.toString()
    clientId = (await createClient(ana, { name: "Cliente", email: "cliente@example.test" })).id
    activityId = (await createActivity(ana, businessId, { name: "Design", hourlyRateCents: 10000 })).id
})
afterAll(async () => {
    vi.unstubAllGlobals()
    await mongoose.disconnect()
    await replica?.stop()
    for (const key of ["INTEGRATIONS_ENCRYPTION_KEY", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "APP_ORIGIN"]) delete process.env[key]
})

async function acceptedWork(dueDate: string) {
    const order = await createOrder(ana, businessId, { clientId, description: "Site institucional", items: [{ activityId, minutes: 600 }], dueDate })
    const sent = await sendOrder(ana, businessId, order.id, { version: order.version, email: false })
    const accepted = await acceptOrder(ana, businessId, order.id, { version: sent.order.version })
    return getWork(ana, businessId, accepted.workId!)
}

/** Conecta pelo fluxo completo (estado + PKCE + retorno) e escolhe as agendas. */
async function connect(who: AccessContext = ana, session = ana) {
    const { url } = await startGoogleConnect(who, { returnTo: "/calendario" })
    const params = new URL(url).searchParams
    expect(params.get("code_challenge_method")).toBe("S256")
    expect(params.get("scope")).toContain("calendar.events")
    const result = await finishGoogleConnect({ userId: session.userId, sessionVersion: session.sessionVersion }, { state: params.get("state"), code: "code-1", error: null })
    return { result, state: params.get("state")! }
}
const linkOf = (kind: string, refId: string) => calendar.links.findOne({ kind, refId }).lean()

describe("conexão (OAuth)", () => {
    it("estado de uso único, sessão do mesmo ator, tokens cifrados e nunca devolvidos; auditoria", async () => {
        const { result, state } = await connect()
        expect(result).toEqual({ returnTo: "/calendario", result: "connected" })
        const stored = await calendar.connections.findOne({ ownerId: ana.userId }).lean()
        expect(stored).toMatchObject({ googleEmail: "ana@gmail.test", status: "choose_calendar", connectedBy: ana.userId })
        expect(JSON.stringify(stored)).not.toContain("refresh-secret-1")
        const dto = await getGoogleConnection(ana)
        expect(dto).toMatchObject({ connected: true, googleEmail: "ana@gmail.test", status: "choose_calendar" })
        expect(JSON.stringify(dto)).not.toMatch(/refresh|access-1|tokenBox/)
        const audit = await access.audits.findOne({ action: "calendar.google.connect" }).lean()
        expect(audit?.actorId).toBe(ana.userId)
        expect(JSON.stringify(audit)).not.toContain("refresh-secret-1")
        // Reusar o estado não funciona.
        expect((await finishGoogleConnect({ userId: ana.userId, sessionVersion: ana.sessionVersion }, { state, code: "x", error: null })).result).toBe("error")
    })
    it("retorno com outra sessão é recusado; cancelado no Google não grava nada", async () => {
        const { url } = await startGoogleConnect(ana, {})
        const state = new URL(url).searchParams.get("state")
        expect((await finishGoogleConnect({ userId: admin.userId, sessionVersion: admin.sessionVersion }, { state, code: "c", error: null })).result).toBe("error")
        const again = new URL((await startGoogleConnect(ana, {})).url).searchParams.get("state")
        expect((await finishGoogleConnect({ userId: ana.userId, sessionVersion: ana.sessionVersion }, { state: again, code: null, error: "access_denied" })).result).toBe("cancelled")
        expect(await calendar.connections.countDocuments()).toBe(0)
    })
    it("simulação de usuário: a conexão fica ligada ao alvo e a auditoria guarda o ator real", async () => {
        const simulated = { ...(await resolveAccess(admin.userId, Buffer.from(JSON.stringify({ tipo: "usuario", userId: ana.userId })).toString("base64url"))), timeZone: TZ }
        const { result } = await connect(simulated, admin)
        expect(result.result).toBe("connected")
        expect(await calendar.connections.findOne({ ownerId: ana.userId }).lean()).toMatchObject({ connectedBy: admin.userId })
        const audit = await access.audits.findOne({ action: "calendar.google.connect" }).lean()
        expect(audit?.actorId).toBe(admin.userId)
        expect(audit?.simulation).toBeTruthy()
    })
})

describe("publicação e leitura", () => {
    it("escolher a agenda publica prazos/períodos/pedidos abertos; as agendas lidas aparecem e contam como ocupadas", async () => {
        const work = await acceptedWork(day(5))
        const order = await createOrder(ana, businessId, { clientId, description: "Logo", items: [{ activityId, minutes: 60 }], dueDate: day(3) })
        await connect()
        expect((await listGoogleCalendars(ana)).map((item) => [item.id, item.writable])).toEqual([[PUBLISH, true], [TEAM, false]])
        await expect(updateGoogleSettings(ana, { publishCalendarId: TEAM })).rejects.toMatchObject({ code: "GOOGLE_CALENDAR_READ_ONLY" })
        const dto = await updateGoogleSettings(ana, { publishCalendarId: PUBLISH, readCalendarIds: [TEAM] })
        expect(dto).toMatchObject({ status: "active", publishCalendarName: "Trabalho", readCalendars: [{ id: TEAM, name: "Equipe" }] })
        const published = google.events(PUBLISH)
        expect(published.map((event) => event.summary).sort()).toEqual(["Execução: PED-0001 · Site institucional", "Prazo do pedido: PED-0002 · Logo", "Prazo: PED-0001 · Site institucional"].sort())
        expect(published.every((event) => event.extendedProperties?.private?.ciliar === "1")).toBe(true)
        expect(await linkOf("work-deadline", work.id)).toMatchObject({ dirty: false, status: "linked", calendarId: PUBLISH })
        expect(await linkOf("order-deadline", order.id)).toMatchObject({ dirty: false })

        // Evento ocupado de 2 h amanhã na agenda lida (com hora, em outro fuso).
        google.touch(TEAM, { id: "team-1", etag: "", status: "confirmed", summary: "Reunião", start: { dateTime: `${day(1)}T10:00:00-05:00` }, end: { dateTime: `${day(1)}T12:00:00-05:00` } })
        const range = await listCalendarEvents(ana, { from: day(0), to: day(6) })
        expect(range.events.find((event) => event.kind === "google")).toMatchObject({ title: "Reunião", allDay: false, start: `${day(1)}T15:00:00.000Z`, google: expect.objectContaining({ calendarName: "Equipe", busy: true }) })
        expect(range.events.filter((event) => event.kind === "google")).toHaveLength(1)
        const conflict = await checkDeadlineConflict(ana, { dueDate: day(3), estimatedMinutes: 60 })
        expect(conflict.capacity?.busyMinutes).toBe(120)
    })

    it("mudança no Ciliar atualiza o evento; status como histórico; cota excedida espera e tenta de novo", async () => {
        const work = await acceptedWork(day(5))
        await connect()
        await updateGoogleSettings(ana, { publishCalendarId: PUBLISH })
        const link = (await linkOf("work-deadline", work.id))!
        await updateWork(ana, businessId, work.id, { dueDate: day(9), version: work.version })
        expect(await linkOf("work-deadline", work.id)).toMatchObject({ dirty: true })
        google.failNext = { match: /^PATCH /, status: 429, body: { error: { errors: [{ reason: "rateLimitExceeded" }] } } }
        expect((await processPublishQueue(ana.userId)).stopped).toBe(true)
        const waiting = await loadConnection(ana.userId)
        expect(waiting?.backoffUntil).toBeTruthy()
        expect((await processPublishQueue(ana.userId)).published).toBe(0)
        await calendar.connections.updateOne({ ownerId: ana.userId }, { $set: { backoffUntil: null } })
        await processPublishQueue(ana.userId)
        expect(google.calendars.get(PUBLISH)!.get(link.eventId!)).toMatchObject({ end: { date: day(10) } })

        // Pago → título com o status, o evento continua.
        await works.works.updateOne({ _id: work.id }, { $set: { column: "paid" } })
        await calendar.links.updateMany({ refId: work.id }, { $set: { dirty: true } })
        await processPublishQueue(ana.userId)
        expect(google.calendars.get(PUBLISH)!.get(link.eventId!)!.summary).toContain("[Pago]")
    })
})

describe("do Google para o Ciliar", () => {
    async function ready() {
        const work = await acceptedWork(day(5))
        await connect()
        await updateGoogleSettings(ana, { publishCalendarId: PUBLISH })
        await syncConnection(ana.userId) // primeira lista: guarda o syncToken (o eco da publicação é ignorado)
        return { work, deadline: (await linkOf("work-deadline", work.id))!, period: (await linkOf("work-period", work.id))! }
    }

    it("mover a data muda o prazo (W1) com o dono como ator e origem google; o eco não gera ciclo", async () => {
        const { work, deadline } = await ready()
        const before = await syncConnection(ana.userId)
        expect(before).toMatchObject({ applied: 0, corrected: 0 })
        google.userEdit(PUBLISH, deadline.eventId!, { start: { date: day(7) }, end: { date: day(8) }, summary: "Editado no Google" })
        expect(await syncConnection(ana.userId)).toMatchObject({ applied: 1 })
        expect((await getWork(ana, businessId, work.id)).dueDate).toBe(day(7))
        const audit = await access.audits.findOne({ action: "calendar.google.apply" }).lean()
        expect(audit).toMatchObject({ actorId: ana.userId, after: expect.objectContaining({ source: "google", dueDate: day(7) }) })
        expect(await orders.orderVersions.findOne({ orderId: work.orderId }).sort({ number: -1 }).lean()).toMatchObject({ reason: "work", published: false })
        // O título volta a ser o do Ciliar e o eco da própria publicação é ignorado.
        await processPublishQueue(ana.userId)
        expect(google.calendars.get(PUBLISH)!.get(deadline.eventId!)!.summary).toBe("Prazo: PED-0001 · Site institucional")
        expect(await syncConnection(ana.userId)).toMatchObject({ applied: 0, corrected: 0 })
    })

    it("período: o fim vira o prazo e o início é corrigido de volta", async () => {
        const { work, period } = await ready()
        const start = google.calendars.get(PUBLISH)!.get(period.eventId!)!.start!.date
        google.userEdit(PUBLISH, period.eventId!, { start: { date: day(-3) }, end: { date: day(12) } })
        await syncConnection(ana.userId)
        expect((await getWork(ana, businessId, work.id)).dueDate).toBe(day(11))
        await processPublishQueue(ana.userId)
        expect(google.calendars.get(PUBLISH)!.get(period.eventId!)!.start!.date).toBe(start)
    })

    it("excluir no Google só desfaz o vínculo; Republicar recria", async () => {
        const { work, deadline } = await ready()
        google.userEdit(PUBLISH, deadline.eventId!, { status: "cancelled" })
        expect(await syncConnection(ana.userId)).toMatchObject({ unlinked: 1 })
        expect((await getWork(ana, businessId, work.id)).dueDate).toBe(day(5))
        await updateWork(ana, businessId, work.id, { dueDate: day(6), version: (await getWork(ana, businessId, work.id)).version })
        await processPublishQueue(ana.userId)
        expect(await linkOf("work-deadline", work.id)).toMatchObject({ status: "unlinked", unlinkedReason: "deleted_in_google" })
        expect((await getGoogleConnection(ana)).unlinked).toBe(1)
        await republishGoogle(ana, { kind: "work-deadline", id: work.id })
        const relinked = (await linkOf("work-deadline", work.id))!
        expect(relinked).toMatchObject({ status: "linked", dirty: false })
        expect(relinked.eventId).not.toBe(deadline.eventId)
    })

    it("pedido encerrado ou data inválida: a data é corrigida de volta; eventos manuais não são importados", async () => {
        await ready()
        const order = await createOrder(ana, businessId, { clientId, description: "Logo", items: [{ activityId, minutes: 60 }], dueDate: day(3) })
        await processPublishQueue(ana.userId)
        const link = (await linkOf("order-deadline", order.id))!
        await cancelOrder(ana, businessId, order.id, { version: (await getOrder(ana, businessId, order.id)).version })
        await processPublishQueue(ana.userId)
        expect(google.calendars.get(PUBLISH)!.get(link.eventId!)!.summary).toContain("[Cancelado]")
        google.userEdit(PUBLISH, link.eventId!, { start: { date: day(9) }, end: { date: day(10) } })
        google.touch(PUBLISH, { id: "manual-1", etag: "", status: "confirmed", summary: "Dentista", start: { date: day(2) }, end: { date: day(3) } })
        expect(await syncConnection(ana.userId)).toMatchObject({ applied: 0, corrected: 1 })
        expect((await getOrder(ana, businessId, order.id)).dueDate).toBe(day(3))
        await processPublishQueue(ana.userId)
        expect(google.calendars.get(PUBLISH)!.get(link.eventId!)!.end!.date).toBe(day(4))
    })

    it("token revogado pede reconexão; agenda de publicação excluída pede outra", async () => {
        await ready()
        await calendar.connections.updateOne({ ownerId: ana.userId }, { $set: { accessTokenExpiresAt: new Date(0) } })
        google.refreshFails = true
        await syncConnection(ana.userId)
        expect((await getGoogleConnection(ana)).status).toBe("reauth")
        await expect(syncGoogleNow(ana)).rejects.toMatchObject({ code: "GOOGLE_REAUTH_REQUIRED" })

        google.refreshFails = false
        await calendar.connections.updateOne({ ownerId: ana.userId }, { $set: { status: "active" } })
        google.calendars.delete(PUBLISH)
        await createOrder(ana, businessId, { clientId, description: "Novo", items: [], dueDate: day(2) })
        await processPublishQueue(ana.userId)
        expect((await getGoogleConnection(ana)).status).toBe("choose_calendar")
    })
})

describe("notificação push e desconexão", () => {
    it("canal com HTTPS: valida o token do canal e agenda a sincronização; token errado é recusado", async () => {
        process.env.APP_ORIGIN = "https://ciliar.example.test"
        await acceptedWork(day(5))
        await connect()
        await updateGoogleSettings(ana, { publishCalendarId: PUBLISH })
        const connection = (await loadConnection(ana.userId))!
        expect(connection.channel).toMatchObject({ calendarId: PUBLISH, resourceId: "res-1" })
        // O token do canal só existe em hash: recria um canal conhecido para o teste.
        await calendar.connections.updateOne({ ownerId: ana.userId }, { $set: { channel: null } })
        await ensureChannel((await loadConnection(ana.userId))!, await accessTokenOf((await loadConnection(ana.userId))!))
        const watch = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/events/watch")).at(-1)!
        const secret = JSON.parse(String((watch[1] as RequestInit).body)).token as string
        const channelId = (await loadConnection(ana.userId))!.channel!.id
        await expect(handleGoogleNotification(new Headers({ "x-goog-channel-id": channelId, "x-goog-channel-token": "errado", "x-goog-resource-state": "exists" }))).rejects.toMatchObject({ status: 404 })
        await handleGoogleNotification(new Headers({ "x-goog-channel-id": channelId, "x-goog-channel-token": secret, "x-goog-resource-state": "exists" }))
        expect(runAfterResponse).toHaveBeenCalledWith("calendar-google-notify", expect.any(Function))
    })

    it("desconectar revoga, apaga tokens e vínculos; os eventos ficam no Google; o calendário segue sem o Google", async () => {
        await acceptedWork(day(5))
        await connect()
        await updateGoogleSettings(ana, { publishCalendarId: PUBLISH })
        const published = google.events(PUBLISH).length
        await disconnectGoogle(ana)
        expect(google.requests).toContain("POST /revoke")
        expect(await calendar.connections.countDocuments()).toBe(0)
        expect(await calendar.links.countDocuments()).toBe(0)
        expect(google.events(PUBLISH)).toHaveLength(published)
        expect(await access.audits.findOne({ action: "calendar.google.disconnect" }).lean()).toBeTruthy()
        expect((await listCalendarEvents(ana, { from: day(0), to: day(6) })).events.some((event) => event.kind === "work-deadline")).toBe(true)
    })

    it("falha do Google na leitura vira erro e o resto do calendário continua", async () => {
        await acceptedWork(day(5))
        await connect()
        await updateGoogleSettings(ana, { publishCalendarId: PUBLISH, readCalendarIds: [TEAM] })
        clearGoogleReadCache()
        google.failNext = { match: /^GET .*equipe/, status: 500, body: { error: { errors: [{ reason: "backendError" }] } } }
        const range = await listCalendarEvents(ana, { from: day(0), to: day(6) })
        expect(range.googleError).toMatch(/Google/)
        expect(range.events.some((event) => event.kind === "work-deadline")).toBe(true)
    })
})
