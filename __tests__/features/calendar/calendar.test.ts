import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server-core"

vi.mock("@/lib/db", async (original) => ({ ...(await original<object>()), dbConnect: vi.fn(async () => undefined) }))
vi.mock("ai", () => ({ dynamicTool: (def: unknown) => def }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined), integrationChannel: (id: string) => `private-integration-${id}` }))
vi.mock("@/lib/after-response", () => ({ runAfterResponse: vi.fn() }))
vi.mock("@/lib/email/mailer", () => ({ isMockMode: vi.fn(async () => true), sendEmail: vi.fn() }))

import { todayKeyIn } from "@/lib/timezone"
import { BUSINESS_FULL_PERMISSIONS } from "@/features/businesses/permissions"
import { accessModels } from "@/features/access/server/models"
import { createRole } from "@/features/access/server/commands"
import { resolveAccess } from "@/features/access/server/access"
import type { AccessContext } from "@/features/access/server/context"
import { businessModels } from "@/features/businesses/server/models"
import { createActivity } from "@/features/businesses/server/activities"
import { archiveBusiness } from "@/features/businesses/server/businesses"
import { platformModels } from "@/features/platform/server/models"
import { addDaysToKey } from "@/features/orders/logic"
import { orderModels } from "@/features/orders/server/models"
import { createClient } from "@/features/orders/server/clients"
import { acceptOrder, createOrder, getOrder, sendOrder, updateOrder } from "@/features/orders/server/orders"
import { workModels } from "@/features/works/server/models"
import { getWork, updateWork } from "@/features/works/server/works"
import { createTimeEntry } from "@/features/works/server/time"
import { calendarModels } from "@/features/calendar/server/models"
import { listCalendarEvents } from "@/features/calendar/server/range"
import { checkDeadlineConflict } from "@/features/calendar/server/conflict"
import { grantCalendarPermission, GRANT_CALENDAR_PERMISSION_MIGRATION } from "@/lib/db/migrations/grant-calendar-permission"
import { findOpexTool } from "@/features/opex-agent/server/tools/registry"
import { scopeOfAccess } from "@/features/opex-agent/server/scope"

const TZ = "America/Sao_Paulo"
let replica: MongoMemoryReplSet
let admin: AccessContext
let ana: AccessContext
let bia: AccessContext
let businessId: string
let otherBusinessId: string
let clientId: string
let activityId: string
const access = accessModels()
const businesses = businessModels()
const orders = orderModels()
const works = workModels()
const platform = platformModels()
const calendar = calendarModels()
const all = () => [...Object.values(access), ...Object.values(businesses), ...Object.values(orders), ...Object.values(works), ...Object.values(platform), ...Object.values(calendar)]
const today = () => todayKeyIn(TZ)
const day = (offset: number) => addDaysToKey(today(), offset)
const range = (from = day(-7), to = day(30)) => ({ from, to })

beforeAll(async () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "calendar-tests-only-key"
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.18" }, replSet: { count: 1 }, instanceOpts: [{ ip: "127.0.0.1" }] })
    await mongoose.connect(replica.getUri("ciliar_calendar_test"))
    await Promise.all(all().map((model) => model.init()))
}, 120_000)
beforeEach(async () => {
    await Promise.all(all().map((model) => model.deleteMany({})))
    await mongoose.connection.collection("app_migrations").deleteMany({})
    const role = await access.roles.create({ slug: "admin", nome: "Administrador", permissoes: ["*"], ativo: true })
    const actor = await access.users.create({ name: "Admin", email: "admin@example.test", active: true, roles: [role.id] })
    admin = { ...(await resolveAccess(actor.id as string)), timeZone: TZ }
    const provider = await createRole(admin, { nome: "Prestador", descricao: "", cor: "azul", ativo: true, permissoes: [...BUSINESS_FULL_PERMISSIONS], limiteNegocios: null })
    const a = await access.users.create({ name: "Ana", email: "ana@example.test", active: true, roles: [provider.id] })
    const b = await access.users.create({ name: "Bia", email: "bia@example.test", active: true, roles: [provider.id] })
    ana = { ...(await resolveAccess(a.id as string)), timeZone: TZ }
    bia = { ...(await resolveAccess(b.id as string)), timeZone: TZ }
    // Expediente: todos os dias, dia inteiro (24 h) no primeiro negócio; o segundo sem disponibilidade.
    const business = await businesses.businesses.create({ ownerId: ana.userId, number: 1, name: "Studio", availability: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: null, end: null })), theme: { primaryColor: "#AA0000", mode: "dark" }, createdBy: ana.userId, updatedBy: ana.userId })
    businessId = business._id.toString()
    otherBusinessId = (await businesses.businesses.create({ ownerId: ana.userId, number: 2, name: "Fotos", createdBy: ana.userId, updatedBy: ana.userId }))._id.toString()
    clientId = (await createClient(ana, { name: "Cliente", email: "cliente@example.test" })).id
    activityId = (await createActivity(ana, businessId, { name: "Design", hourlyRateCents: 10000 })).id
})
afterAll(async () => {
    await mongoose.disconnect()
    await replica?.stop()
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY
})

async function acceptedWork(dueDate: string, minutes = 600, description = "Site institucional") {
    const order = await createOrder(ana, businessId, { clientId, description, items: [{ activityId, minutes }], dueDate })
    const sent = await sendOrder(ana, businessId, order.id, { version: order.version, email: false })
    const accepted = await acceptOrder(ana, businessId, order.id, { version: sent.order.version })
    return getWork(ana, businessId, accepted.workId!)
}
const userSimulation = async (target: AccessContext) => ({ ...(await resolveAccess(admin.userId, Buffer.from(JSON.stringify({ tipo: "usuario", userId: target.userId })).toString("base64url"))), timeZone: TZ })

describe("eventos do calendário", () => {
    it("prazos e períodos dos trabalhos, prazos dos pedidos abertos, horas por dia e expediente; só do dono efetivo", async () => {
        const work = await acceptedWork(day(5))
        await createTimeEntry(ana, businessId, work.id, { source: "orderItem", refId: work.items[0]!.id, date: today(), minutes: 90 })
        await createOrder(ana, businessId, { clientId, description: "Logo", items: [{ activityId, minutes: 60 }], dueDate: day(3) })
        await createOrder(ana, businessId, { clientId, description: "Sem prazo", items: [] })

        const result = await listCalendarEvents(ana, range())
        const kinds = result.events.map((event) => event.kind).sort()
        expect(kinds).toEqual(["logged-hours", "order-deadline", "work-deadline", "work-period"])
        const deadline = result.events.find((event) => event.kind === "work-deadline")!
        expect(deadline).toMatchObject({ code: "PED-0001", title: "Site institucional", businessName: "Studio", color: "#AA0000", start: day(5), draggable: true, workId: work.id })
        expect(result.events.find((event) => event.kind === "work-period")).toMatchObject({ start: today(), end: day(5), draggable: false })
        expect(result.events.find((event) => event.kind === "order-deadline")).toMatchObject({ statusLabel: "Rascunho", start: day(3), draggable: true })
        expect(result.events.find((event) => event.kind === "logged-hours")).toMatchObject({ minutes: 90, details: [expect.objectContaining({ workId: work.id, minutes: 90 })] })
        expect(result.availability.find((item) => item.date === today())?.windows).toEqual([[0, 1440]])
        expect(result.noAvailability).toBe(false)
        expect(result.businesses.map((business) => business.name)).toEqual(["Studio", "Fotos"])
        expect(result.own).toBe(true)
        expect(result.google).toMatchObject({ connected: false })

        expect((await listCalendarEvents(bia, range())).events).toEqual([])
        expect((await listCalendarEvents(ana, { ...range(), types: "order-deadline" })).events.map((event) => event.kind)).toEqual(["order-deadline"])
        expect((await listCalendarEvents(ana, { ...range(), businessId: otherBusinessId })).events).toEqual([])
    })

    it("Pago e arquivado saem; negócio arquivado some do calendário e do expediente", async () => {
        const work = await acceptedWork(day(5))
        await works.works.updateOne({ _id: work.id }, { $set: { column: "paid" } })
        expect((await listCalendarEvents(ana, range())).events.filter((event) => event.workId === work.id && event.kind !== "logged-hours")).toEqual([])
        await archiveBusiness(ana, businessId)
        const result = await listCalendarEvents(ana, range())
        expect(result.businesses.map((business) => business.name)).toEqual(["Fotos"])
        expect(result.noAvailability).toBe(true)
        expect(result.availability.every((item) => item.windows.length === 0)).toBe(true)
    })

    it("suporte lê o negócio de outro usuário sem Google nem arraste (auditado); sem calendar.view não abre", async () => {
        await acceptedWork(day(5))
        const support = await listCalendarEvents(admin, { ...range(), businessId })
        expect(support.own).toBe(false)
        expect(support.google).toBeNull()
        expect(support.events.every((event) => !event.draggable)).toBe(true)
        expect(await access.audits.findOne({ actorId: admin.userId, action: { $regex: "support" } }).lean()).toBeTruthy()

        const limited = await createRole(admin, { nome: "Sem calendário", descricao: "", cor: "azul", ativo: true, permissoes: BUSINESS_FULL_PERMISSIONS.filter((key) => key !== "calendar.view"), limiteNegocios: null })
        await access.users.updateOne({ _id: bia.userId }, { $set: { roles: [limited.id] } })
        const noCalendar = { ...(await resolveAccess(bia.userId)), timeZone: TZ }
        await expect(listCalendarEvents(noCalendar, range())).rejects.toMatchObject({ status: 403 })
    })

    it("simulação de usuário mostra o calendário do alvo", async () => {
        await acceptedWork(day(5))
        const simulated = await userSimulation(ana)
        expect((await listCalendarEvents(simulated, range())).events.some((event) => event.kind === "work-deadline")).toBe(true)
    })

    it("marca o dia com conflito de capacidade e de sobreposição", async () => {
        await acceptedWork(day(2), 600)
        // Pedido aberto com mais horas do que existem até o prazo (expediente 24 h/dia).
        await createOrder(ana, businessId, { clientId, description: "Gigante", items: [{ activityId, minutes: 24 * 60 * 10 }], dueDate: day(2) })
        const result = await listCalendarEvents(ana, range())
        const order = result.events.find((event) => event.kind === "order-deadline")!
        expect(order.conflict).toBe("strong")
        expect(result.conflicts[day(2)]).toBe("strong")
    })
})

describe("alerta de conflito (serviço)", () => {
    it("por data e horas, por pedido e por trabalho (o próprio trabalho fica de fora)", async () => {
        const work = await acceptedWork(day(4), 600)
        const byDate = await checkDeadlineConflict(ana, { dueDate: day(3), estimatedMinutes: 60 })
        expect(byDate.level).toBe("info")
        expect(byDate.overlap).toEqual([expect.objectContaining({ id: work.id, code: "PED-0001" })])
        expect(byDate.businessNames[businessId]).toBe("Studio")

        const heavy = await checkDeadlineConflict(ana, { businessId, dueDate: day(1), estimatedMinutes: 24 * 60 * 5 })
        expect(heavy.level).toBe("strong")
        expect(heavy.capacity).toMatchObject({ requiredMinutes: 24 * 60 * 5, insufficient: true, noAvailability: false })

        const self = await checkDeadlineConflict(ana, { businessId, workId: work.id })
        expect(self.overlap).toEqual([])
        expect(self.capacity?.requiredMinutes).toBe(600)
        expect(self.capacity?.worksMinutes).toBe(0)

        const order = await createOrder(ana, businessId, { clientId, description: "Outro", items: [{ activityId, minutes: 120 }], dueDate: day(10) })
        const fromOrder = await checkDeadlineConflict(ana, { businessId, orderId: order.id })
        expect(fromOrder).toMatchObject({ dueDate: day(10), level: "info", capacity: expect.objectContaining({ requiredMinutes: 120, worksMinutes: 600 }) })

        await expect(checkDeadlineConflict(bia, { businessId, orderId: order.id })).rejects.toMatchObject({ code: "BUSINESS_NOT_FOUND" })
    })
})

describe("mover o prazo (os mesmos serviços do arraste)", () => {
    it("trabalho pela W1 (versão work não publicada); rascunho sem versão; enviado com versão publicada", async () => {
        const work = await acceptedWork(day(5))
        const before = await orders.orderVersions.countDocuments({ orderId: work.orderId })
        const moved = await updateWork(ana, businessId, work.id, { dueDate: day(8), version: work.version })
        expect(moved.dueDate).toBe(day(8))
        const versions = await orders.orderVersions.find({ orderId: work.orderId }).sort({ number: -1 }).lean()
        expect(versions[0]).toMatchObject({ reason: "work", published: false })
        expect(versions).toHaveLength(before + 1)

        const draft = await createOrder(ana, businessId, { clientId, description: "Rascunho", items: [{ activityId, minutes: 60 }], dueDate: day(3) })
        await updateOrder(ana, businessId, draft.id, { dueDate: day(4), version: draft.version })
        expect(await orders.orderVersions.countDocuments({ orderId: draft.id })).toBe(0)

        const sent = (await sendOrder(ana, businessId, draft.id, { version: (await getOrder(ana, businessId, draft.id)).version, email: false })).order
        const moved2 = await updateOrder(ana, businessId, draft.id, { dueDate: day(6), version: sent.version })
        expect(moved2.status).toBe("sent")
        expect(await orders.orderVersions.findOne({ orderId: draft.id }).sort({ number: -1 }).lean()).toMatchObject({ reason: "edit", published: true })
    })
})

describe("migração da permissão", () => {
    it("dá calendar.view uma vez aos perfis com businesses.use (não ao Administrador nem a quem não usa negócios)", async () => {
        const legacy = await access.roles.create({ slug: "legado", nome: "Legado", permissoes: ["businesses.use", "works.view"], ativo: true })
        const other = await access.roles.create({ slug: "outro", nome: "Outro", permissoes: ["users.view"], ativo: true })
        expect(await grantCalendarPermission()).toBeGreaterThanOrEqual(1)
        expect((await access.roles.findById(legacy.id).lean())?.permissoes).toContain("calendar.view")
        expect((await access.roles.findById(other.id).lean())?.permissoes).not.toContain("calendar.view")
        expect((await access.roles.findOne({ slug: "admin" }).lean())?.permissoes).toEqual(["*"])
        await access.roles.updateOne({ _id: legacy.id }, { $pull: { permissoes: "calendar.view" } })
        expect(await grantCalendarPermission()).toBe(0)
        expect((await access.roles.findById(legacy.id).lean())?.permissoes).not.toContain("calendar.view")
        expect(await mongoose.connection.collection("app_migrations").findOne({ _id: GRANT_CALENDAR_PERMISSION_MIGRATION as never })).toBeTruthy()
    })
})

describe("ferramentas do Agente Opex", () => {
    const context = (who: AccessContext) => ({ sessionId: "s", actorId: who.userId, scope: scopeOfAccess(who), access: who })
    const run = (name: string, input: unknown, who: AccessContext = ana) => {
        const tool = findOpexTool(name)!
        return tool.execute(tool.input.parse(input), context(who) as never)
    }
    it("list_calendar_events e check_deadline_conflict usam os serviços reais", async () => {
        const work = await acceptedWork(day(4))
        const listed = (await run("list_calendar_events", { from: day(-1), to: day(10), types: ["work-deadline"] })) as { events: { kind: string; workId: string }[]; google: unknown }
        expect(listed.events).toEqual([expect.objectContaining({ kind: "work-deadline", workId: work.id })])
        const conflict = (await run("check_deadline_conflict", { dueDate: day(3), estimatedMinutes: 60 })) as { level: string; overlap: { businessName: string }[] }
        expect(conflict.level).toBe("info")
        expect(conflict.overlap[0]!.businessName).toBe("Studio")
        await expect(run("sync_google_calendar", {})).rejects.toMatchObject({ code: "GOOGLE_NOT_CONNECTED" })
    })
})
