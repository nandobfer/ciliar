import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server-core"

vi.mock("@/lib/db", async (original) => ({ ...(await original<object>()), dbConnect: vi.fn(async () => undefined) }))
vi.mock("ai", () => ({ dynamicTool: (def: unknown) => def }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined), integrationChannel: (id: string) => `private-integration-${id}` }))
vi.mock("@/lib/after-response", () => ({ runAfterResponse: vi.fn() }))
vi.mock("@/lib/email/mailer", () => ({ isMockMode: vi.fn(async () => true), sendEmail: vi.fn() }))
const aiState = vi.hoisted(() => ({ beforeReturn: null as (() => Promise<void>) | null }))
vi.mock("@/lib/ai/stream", () => ({ streamAi: async function* () {
    if (aiState.beforeReturn) await aiState.beforeReturn()
    yield { type: "delta", text: '{"title":"Título da IA","summary":"Resumo da IA"}' }
    yield { type: "done" }
} }))
vi.mock("@/features/ai/server/settings", async (original) => ({
    ...(await original<object>()),
    availability: vi.fn(async () => ({ available: true, reason: null })),
    loadFeature: vi.fn(async () => ({ settings: { enabled: true, main: { provider: "openai", model: "test", variant: null, temperature: null, maxOutputTokens: null }, instructions: "Gerar" }, isDefault: false, updatedAt: null })),
}))

import { BUSINESS_FULL_PERMISSIONS } from "@/features/businesses/permissions"
import { accessModels } from "@/features/access/server/models"
import { createRole } from "@/features/access/server/commands"
import { resolveAccess } from "@/features/access/server/access"
import type { AccessContext } from "@/features/access/server/context"
import { businessModels } from "@/features/businesses/server/models"
import { createActivity, updateActivity } from "@/features/businesses/server/activities"
import { archiveBusiness, currencyLocked, deleteBusiness } from "@/features/businesses/server/businesses"
import { platformModels } from "@/features/platform/server/models"
import { orderModels } from "@/features/orders/server/models"
import { archiveClient, createClient, deleteClient, getClient, listClients, purgeArchivedClients } from "@/features/orders/server/clients"
import { acceptOrder, cancelOrder, createOrder, getOrder, listOrders, orderLinkUrl, rejectOrder, reopenOrder, revokeOrderLink, sendOrder, updateOrder } from "@/features/orders/server/orders"
import { decideQuote, getPublicQuote } from "@/features/orders/server/public"
import { newQuoteToken, quoteTokenMatches } from "@/features/orders/server/link"
import { findOpexTool } from "@/features/opex-agent/server/tools/registry"
import { scopeOfAccess } from "@/features/opex-agent/server/scope"
import { generateOrderTitle } from "@/features/orders/server/ai"

let replica: MongoMemoryReplSet
let admin: AccessContext
let ana: AccessContext
let bia: AccessContext
let businessId: string
let clientId: string
let activityId: string
const access = accessModels()
const businesses = businessModels()
const orders = orderModels()
const platform = platformModels()
const tokenOf = (url: string) => url.split("/").at(-1)!

beforeAll(async () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "orders-tests-only-key"
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.18" }, replSet: { count: 1 }, instanceOpts: [{ ip: "127.0.0.1" }] })
    await mongoose.connect(replica.getUri("ciliar_orders_test"))
    await Promise.all([...Object.values(access), ...Object.values(businesses), ...Object.values(orders), ...Object.values(platform)].map((model) => model.init()))
}, 120_000)
beforeEach(async () => {
    aiState.beforeReturn = null
    await Promise.all([...Object.values(access), ...Object.values(businesses), ...Object.values(orders), ...Object.values(platform)].map((model) => model.deleteMany({})))
    const role = await access.roles.create({ slug: "admin", nome: "Administrador", permissoes: ["*"], ativo: true })
    const actor = await access.users.create({ name: "Admin", email: "admin@example.test", active: true, roles: [role.id] })
    admin = await resolveAccess(actor.id as string)
    const provider = await createRole(admin, { nome: "Prestador", descricao: "", cor: "azul", ativo: true, permissoes: [...BUSINESS_FULL_PERMISSIONS], limiteNegocios: null })
    const a = await access.users.create({ name: "Ana", email: "ana@example.test", active: true, roles: [provider.id] })
    const b = await access.users.create({ name: "Bia", email: "bia@example.test", active: true, roles: [provider.id] })
    ana = await resolveAccess(a.id as string)
    bia = await resolveAccess(b.id as string)
    const business = await businesses.businesses.create({ ownerId: ana.userId, number: 1, name: "Studio", createdBy: ana.userId, updatedBy: ana.userId })
    businessId = business._id.toString()
    clientId = (await createClient(ana, { name: "Cliente", email: "cliente@example.test", notes: "SEGREDO PRIVADO" })).id
    activityId = (await createActivity(ana, businessId, { name: "Design", hourlyRateCents: 10000 })).id
})
afterAll(async () => { await mongoose.disconnect(); await replica?.stop(); delete process.env.INTEGRATIONS_ENCRYPTION_KEY })
const draft = () => createOrder(ana, businessId, { clientId, description: "Site institucional", items: [{ activityId, minutes: 90 }] })
const send = async () => { const order = await draft(); return sendOrder(ana, businessId, order.id, { version: order.version, email: false }) }

describe("clientes e isolamento", () => {
    it("isola usuários; suporte só lê; simulação usa alvo e audita ator real", async () => {
        expect((await listClients(bia)).items).toHaveLength(0)
        await expect(getClient(bia, clientId)).rejects.toMatchObject({ code: "CLIENT_NOT_FOUND" })
        expect((await getClient(admin, clientId)).editable).toBe(false)
        await expect(archiveClient(admin, clientId)).rejects.toMatchObject({ code: "CLIENT_NOT_FOUND" })
        const marker = Buffer.from(JSON.stringify({ tipo: "usuario", userId: ana.userId })).toString("base64url")
        const simulated = await resolveAccess(admin.userId, marker)
        const created = await createClient(simulated, { name: "Simulado" })
        expect(created.ownerId).toBe(ana.userId)
        const audit = await access.audits.findOne({ action: "business.client.create", targetId: created.id }).lean()
        expect(audit?.actorId).toBe(admin.userId)
        expect(audit?.simulation).toBeTruthy()
    })
    it("cliente com pedido nunca é excluído; purge remove apenas os sem pedidos", async () => {
        await draft()
        await archiveClient(ana, clientId)
        await expect(deleteClient(ana, clientId)).rejects.toMatchObject({ code: "CLIENT_HAS_ORDERS" })
        const empty = await createClient(ana, { name: "Sem pedidos" })
        await archiveClient(ana, empty.id)
        await orders.clients.updateMany({ status: "archived" }, { $set: { archivedAt: new Date("2000-01-01") } })
        await purgeArchivedClients()
        expect(await orders.clients.exists({ _id: empty.id })).toBeNull()
        expect(await orders.clients.exists({ _id: clientId })).toBeTruthy()
    })
})

describe("pedidos e versões", () => {
    it("sequência, moeda travada e valor/hora congelado; rascunho não gera versões", async () => {
        const first = await draft()
        const second = await draft()
        expect([first.code, second.code]).toEqual(["PED-0001", "PED-0002"])
        expect(first.totalCents).toBe(15000)
        expect(await currencyLocked(businessId)).toBe(true)
        const activity = (await businesses.activities.findById(activityId).lean())!
        await updateActivity(ana, businessId, activityId, { hourlyRateCents: 20000, version: activity.version })
        const edited = await updateOrder(ana, businessId, first.id, { version: first.version, items: [{ id: first.items[0]!.id, minutes: 120 }] })
        expect(edited.totalCents).toBe(20000)
        expect(edited.versions).toHaveLength(0)
        await expect(updateOrder(ana, businessId, first.id, { version: first.version, description: "Desatualizado" })).rejects.toMatchObject({ code: "VERSION_CONFLICT" })
        expect((await listOrders(bia)).items).toHaveLength(0)
        await expect(getOrder(bia, businessId, first.id)).rejects.toMatchObject({ code: "BUSINESS_NOT_FOUND" })
    })
    it("ciclo: enviar, editar com histórico público, recusar, reabrir sem publicar rascunho e aceitar", async () => {
        const sent = await send()
        const token = tokenOf(sent.url)
        expect(sent.order.versions).toHaveLength(1)
        const publicQuote = await getPublicQuote(token)
        expect(JSON.stringify(publicQuote)).not.toContain("SEGREDO PRIVADO")
        expect(publicQuote.state).toBe("open")
        const edited = await updateOrder(ana, businessId, sent.order.id, { version: sent.order.version, totalOverrideCents: 18000 })
        expect(edited.versions).toHaveLength(2)
        expect((await getPublicQuote(token)).history[0]!.changes).toContainEqual({ field: "totalCents", before: 15000, after: 18000 })
        const rejected = await rejectOrder(ana, businessId, edited.id, { version: edited.version, reason: "Revisar" })
        const reopened = await reopenOrder(ana, businessId, edited.id, { version: rejected.version })
        expect(reopened.versions[0]!.published).toBe(false)
        await expect(getPublicQuote(token)).rejects.toMatchObject({ code: "QUOTE_NOT_FOUND" })
        const resent = await sendOrder(ana, businessId, edited.id, { version: reopened.version, email: false })
        expect(resent.url).not.toBe(sent.url)
        const accepted = await acceptOrder(ana, businessId, edited.id, { version: resent.order.version })
        expect(accepted.status).toBe("accepted")
        expect(await orders.works.countDocuments({ orderId: edited.id })).toBe(1)
        expect((await orders.works.findOne({ orderId: edited.id }).lean())!).toMatchObject({ column: "opening", totalCents: 18000, estimatedMinutes: 90 })
        await expect(updateOrder(ana, businessId, edited.id, { version: accepted.version, description: "Não" })).rejects.toMatchObject({ code: "ORDER_INVALID_TRANSITION" })
    })
    it("aceite público exige nome, registra IP e só cria um trabalho em decisões concorrentes", async () => {
        const sent = await send()
        const token = tokenOf(sent.url)
        await expect(decideQuote(token, "accept", { name: " " }, "1.2.3.4")).rejects.toThrow()
        const results = await Promise.allSettled([decideQuote(token, "accept", { name: "Maria" }, "1.2.3.4"), decideQuote(token, "accept", { name: "João" }, "5.6.7.8")])
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
        expect(await orders.works.countDocuments({ orderId: sent.order.id })).toBe(1)
        const accepted = await getOrder(ana, businessId, sent.order.id)
        expect(accepted.decision).toMatchObject({ by: "client", kind: "accept" })
        expect(accepted.decision?.ip).toBeTruthy()
        expect((await getPublicQuote(token)).state).toBe("accepted")
    })
    it("prorroga mantendo token; expirado exige novo; negócio arquivado bloqueia decisão e purge remove dados", async () => {
        const sent = await send()
        const renewed = await sendOrder(ana, businessId, sent.order.id, { version: sent.order.version, email: false, validUntil: "2099-01-01" })
        expect(renewed.url).toBe(sent.url)
        await orders.orders.updateOne({ _id: sent.order.id }, { $set: { "link.validUntil": "2000-01-01" } })
        expect((await getPublicQuote(tokenOf(sent.url))).state).toBe("expired")
        await expect(decideQuote(tokenOf(sent.url), "reject", {}, null)).rejects.toMatchObject({ code: "QUOTE_EXPIRED" })
        const resent = await sendOrder(ana, businessId, sent.order.id, { version: renewed.order.version, email: false })
        expect(resent.url).not.toBe(sent.url)
        await archiveBusiness(ana, businessId)
        expect((await getPublicQuote(tokenOf(resent.url))).state).toBe("unavailable")
        await expect(decideQuote(tokenOf(resent.url), "accept", { name: "Ana" }, null)).rejects.toMatchObject({ code: "QUOTE_UNAVAILABLE" })
        await deleteBusiness(ana, businessId)
        expect(await orders.orders.countDocuments()).toBe(0)
        expect(await orders.orderVersions.countDocuments()).toBe(0)
        expect(await orders.clients.exists({ _id: clientId })).toBeTruthy()
    })
    it("revogar volta a rascunho; cancelar é final e mantém moeda travada", async () => {
        const sent = await send()
        const revoked = await revokeOrderLink(ana, businessId, sent.order.id, { version: sent.order.version })
        expect(revoked.status).toBe("draft")
        await expect(orderLinkUrl(ana, businessId, revoked.id)).rejects.toMatchObject({ code: "ORDER_WITHOUT_LINK" })
        const cancelled = await cancelOrder(ana, businessId, revoked.id, { version: revoked.version })
        expect(cancelled.status).toBe("cancelled")
        expect(await currencyLocked(businessId)).toBe(true)
    })
    it("ferramentas chamam os serviços e enviar não devolve URL sem pedido explícito", async () => {
        const created = await draft()
        const tool = findOpexTool("send_order")!
        const input = tool.input.parse({ businessId, orderId: created.id })
        const result = await tool.execute(input, { access: ana, actorId: ana.userId, sessionId: "test", scope: scopeOfAccess(ana) })
        expect(result).not.toHaveProperty("url")
        expect(result).toMatchObject({ status: "sent" })
        const token = newQuoteToken()
        expect(JSON.stringify(token.tokenBox)).not.toContain(token.token)
        expect(quoteTokenMatches(token.token, token.tokenBox)).toBe(true)
        expect(quoteTokenMatches("wrong", token.tokenBox)).toBe(false)
    })
    it("IA preserva edição manual concorrente e rejeita descrição obsoleta", async () => {
        const order = await draft()
        aiState.beforeReturn = async () => { await updateOrder(ana, businessId, order.id, { version: order.version, title: "Manual" }) }
        await generateOrderTitle(order.id)
        let current = await getOrder(ana, businessId, order.id)
        expect(current.title).toBe("Manual")
        expect(current.summary).toBe("Resumo da IA")
        const baseVersion = current.version
        aiState.beforeReturn = async () => { await updateOrder(ana, businessId, order.id, { version: baseVersion, description: "Descrição mais recente", summary: "Resumo novo" }) }
        await generateOrderTitle(order.id)
        current = await getOrder(ana, businessId, order.id)
        expect(current.summary).toBe("Resumo novo")
        const sent = await sendOrder(ana, businessId, current.id, { version: current.version, email: false })
        await acceptOrder(ana, businessId, current.id, { version: sent.order.version })
        aiState.beforeReturn = null
        await generateOrderTitle(order.id)
        expect((await getOrder(ana, businessId, order.id)).title).toBe("Manual")
    })
    it("cliente inline, anexos visíveis e totais por moeda sem vazamento de anexos ocultos", async () => {
        const files = await businesses.files.create(["publico.pdf", "interno.pdf"].map((name) => ({ businessId, ownerId: ana.userId, purpose: "order", pending: true, ready: true, name, mediaType: "application/pdf", size: 1024, key: `test/${name}`, uploadKey: `tmp/${name}`, createdBy: ana.userId })))
        const created = await createOrder(ana, businessId, {
            newClient: { name: "Inline", notes: "NUNCA PUBLICAR" }, description: "Projeto", items: [{ activityId, minutes: 60 }],
            attachments: files.map((file, index) => ({ fileId: file._id.toString(), clientVisible: index === 0 })),
        })
        const sent = await sendOrder(ana, businessId, created.id, { version: created.version, email: true })
        expect(sent.email).toBe("no-email")
        const quote = await getPublicQuote(tokenOf(sent.url))
        expect(quote.attachments.map((file) => file.name)).toEqual(["publico.pdf"])
        expect(JSON.stringify(quote)).not.toContain("interno.pdf")
        expect(JSON.stringify(quote)).not.toContain("NUNCA PUBLICAR")
        const client = await getClient(ana, created.clientId)
        expect(client.totals).toEqual([{ currency: "BRL", orders: 1, openCents: 10000, acceptedCents: 0 }])
        const secondBusiness = await businesses.businesses.create({ ownerId: ana.userId, number: 2, name: "USD", currency: "USD", createdBy: ana.userId, updatedBy: ana.userId })
        await createOrder(ana, secondBusiness._id.toString(), { clientId: created.clientId, description: "Outro", totalOverrideCents: 5000 })
        expect((await getClient(ana, created.clientId)).totals.map((entry) => [entry.currency, entry.openCents])).toEqual([["BRL", 10000], ["USD", 5000]])
    })
})
