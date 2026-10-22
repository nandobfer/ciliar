import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server-core"

vi.mock("@/lib/db", async (original) => ({ ...(await original<object>()), dbConnect: vi.fn(async () => undefined) }))
vi.mock("ai", () => ({ dynamicTool: (def: unknown) => def }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined), integrationChannel: (id: string) => `private-integration-${id}` }))
vi.mock("@/lib/after-response", () => ({ runAfterResponse: vi.fn() }))
vi.mock("@/lib/email/mailer", () => ({ isMockMode: vi.fn(async () => true), sendEmail: vi.fn() }))

import { BUSINESS_FULL_PERMISSIONS } from "@/features/businesses/permissions"
import { accessModels } from "@/features/access/server/models"
import { createRole } from "@/features/access/server/commands"
import { resolveAccess } from "@/features/access/server/access"
import type { AccessContext } from "@/features/access/server/context"
import { businessModels } from "@/features/businesses/server/models"
import { archiveBusiness, getBusinessDetail, updateBusiness } from "@/features/businesses/server/businesses"
import { createActivity, listActivities } from "@/features/businesses/server/activities"
import { getBusinessDashboard } from "@/features/businesses/server/dashboard"
import { platformModels } from "@/features/platform/server/models"
import { orderModels } from "@/features/orders/server/models"
import { createClient, listClients } from "@/features/orders/server/clients"
import { createOrder, getOrder, listOrders, sendOrder } from "@/features/orders/server/orders"
import { workModels } from "@/features/works/server/models"
import { listWorks } from "@/features/works/server/works"
import { getPortfolio, setPortfolioPublished } from "@/features/portfolio/server/portfolio"
import { onboardingState } from "@/features/businesses/server/onboarding"
import { expandBusinessPermissions, EXPAND_BUSINESS_PERMISSIONS_MIGRATION } from "@/lib/db/migrations/expand-business-permissions"

/** Permissões por módulo dos Negócios contra os serviços reais (MongoMemoryReplSet efêmero). */

let replica: MongoMemoryReplSet
let admin: AccessContext
let full: AccessContext
let businessId: string
const access = accessModels()
const businesses = businessModels()
const all = () => [...Object.values(access), ...Object.values(businesses), ...Object.values(platformModels()), ...Object.values(orderModels()), ...Object.values(workModels())]

/** Usuário dono do negócio `businessId`, com o perfil informado. */
async function ownerWith(permissoes: string[]): Promise<AccessContext> {
    const role = await createRole(admin, { nome: `Perfil ${Math.random().toString(36).slice(2, 8)}`, descricao: "", cor: "azul", ativo: true, permissoes, limiteNegocios: null })
    await access.users.updateOne({ _id: full.userId }, { $set: { roles: [role.id] } })
    return resolveAccess(full.userId)
}

beforeAll(async () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "permissions-tests-only-key"
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.18" }, replSet: { count: 1 }, instanceOpts: [{ ip: "127.0.0.1" }] })
    await mongoose.connect(replica.getUri("ciliar_permissions_test"))
    await Promise.all(all().map((model) => model.init()))
}, 120_000)
beforeEach(async () => {
    await Promise.all(all().map((model) => model.deleteMany({})))
    await mongoose.connection.collection("app_migrations").deleteMany({})
    const role = await access.roles.create({ slug: "admin", nome: "Administrador", permissoes: ["*"], ativo: true })
    admin = await resolveAccess((await access.users.create({ name: "Admin", email: "admin@example.test", active: true, roles: [role.id] })).id as string)
    const provider = await createRole(admin, { nome: "Prestador", descricao: "", cor: "azul", ativo: true, permissoes: [...BUSINESS_FULL_PERMISSIONS], limiteNegocios: null })
    full = await resolveAccess((await access.users.create({ name: "Ana", email: "ana@example.test", active: true, roles: [provider.id] })).id as string)
    businessId = (await businesses.businesses.create({ ownerId: full.userId, number: 1, name: "Studio", createdBy: full.userId, updatedBy: full.userId }))._id.toString()
})
afterAll(async () => {
    await mongoose.disconnect()
    await replica?.stop()
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY
})

describe("permissões por módulo", () => {
    it("só Pedidos › Visualizar: lê pedidos, clientes e atividades, mas não cria, envia nem vê trabalhos", async () => {
        const activity = await createActivity(full, businessId, { name: "Design", hourlyRateCents: 10000 })
        const client = await createClient(full, { name: "Cliente" })
        const order = await createOrder(full, businessId, { description: "Site", clientId: client.id, items: [{ activityId: activity.id, minutes: 60 }] })
        const viewer = await ownerWith(["orders.view"])
        expect([...viewer.effective].sort()).toEqual(["activities.view", "businesses.use", "clients.view", "orders.view"])
        expect((await listOrders(viewer)).editable).toBe(false)
        const detail = await getOrder(viewer, businessId, order.id)
        expect(detail).toMatchObject({ editable: false, actions: [] })
        expect((await listClients(viewer)).items).toHaveLength(1)
        expect((await listActivities(viewer, businessId)).editable).toBe(false)
        await expect(createOrder(viewer, businessId, { description: "Site", clientId: client.id, items: [{ activityId: activity.id, minutes: 30 }] })).rejects.toMatchObject({ status: 403 })
        await expect(sendOrder(viewer, businessId, order.id, { version: order.version, email: false })).rejects.toMatchObject({ status: 403 })
        await expect(listWorks(viewer)).rejects.toMatchObject({ status: 403 })
    })

    it("enviar sem decidir: as ações do pedido refletem as chaves; novo cliente no pedido exige Clientes › Criar", async () => {
        const activity = await createActivity(full, businessId, { name: "Design", hourlyRateCents: 10000 })
        const client = await createClient(full, { name: "Cliente" })
        const sender = await ownerWith(["orders.edit", "orders.send"])
        const order = await createOrder(sender, businessId, { description: "Site", clientId: client.id, items: [{ activityId: activity.id, minutes: 60 }] })
        await expect(createOrder(sender, businessId, { description: "Site", newClient: { name: "Outro" }, items: [{ activityId: activity.id, minutes: 30 }] })).rejects.toThrow(/clients\.edit/)
        const sent = await sendOrder(sender, businessId, order.id, { version: order.version, email: false })
        expect((await getOrder(sender, businessId, order.id)).actions.sort()).toEqual(expect.arrayContaining(["revoke", "send"]))
        expect((await getOrder(sender, businessId, order.id)).actions).not.toContain("accept")
        expect(sent.order.status).toBe("sent")
    })

    it("sem o módulo, a tela do negócio é 403; o dashboard só traz os blocos visíveis", async () => {
        const base = await ownerWith(["businesses.use", "activities.view"])
        await expect(listClients(base)).rejects.toMatchObject({ status: 403 })
        await expect(getPortfolio(base, businessId)).rejects.toMatchObject({ status: 403 })
        const dashboard = await getBusinessDashboard(base, businessId)
        expect(dashboard.visible).toEqual({ activities: true, goals: false, documents: false, successes: false, revenue: false })
        // Suporte vê tudo, somente leitura.
        expect((await getBusinessDashboard(admin, businessId)).visible).toMatchObject({ revenue: true, goals: true })
    })

    it("ficha, arquivar e publicar têm chaves próprias; onboarding só com Criar", async () => {
        const viewer = await ownerWith(["businesses.use", "portfolio.edit"])
        const detail = await getBusinessDetail(viewer, businessId)
        expect(detail).toMatchObject({ editable: true, actions: { edit: false, archive: false, delete: false } })
        await expect(updateBusiness(viewer, businessId, { name: "Novo", version: detail.version })).rejects.toMatchObject({ status: 403 })
        await expect(archiveBusiness(viewer, businessId)).rejects.toMatchObject({ status: 403 })
        const portfolio = await getPortfolio(viewer, businessId)
        expect(portfolio).toMatchObject({ editable: true, canPublish: false })
        await expect(setPortfolioPublished(viewer, businessId, true, { version: portfolio.version })).rejects.toMatchObject({ status: 403 })
        await businesses.businesses.deleteMany({})
        expect((await onboardingState(viewer)).required).toBe(false)
        expect((await onboardingState(await ownerWith(["businesses.create"]))).required).toBe(true)
    })
})

describe("migração expand-business-permissions", () => {
    it("expande businesses.use uma vez, não mexe no Administrador, incrementa a versão e audita", async () => {
        const legacy = await access.roles.create({ slug: "gratuito", nome: "Gratuito", permissoes: ["businesses.use", "opex.use"], ativo: true, version: 3 })
        const support = await access.roles.create({ slug: "suporte", nome: "Suporte", permissoes: ["businesses.view_all"], ativo: true })
        expect(await expandBusinessPermissions()).toBeGreaterThanOrEqual(1)
        const migrated = await access.roles.findById(legacy._id).lean().orFail()
        expect(new Set(migrated.permissoes)).toEqual(new Set([...BUSINESS_FULL_PERMISSIONS, "opex.use"]))
        expect(migrated.version).toBe(4)
        expect((await access.roles.findOne({ slug: "admin" }).lean().orFail()).permissoes).toEqual(["*"])
        expect((await access.roles.findById(support._id).lean().orFail()).permissoes).toEqual(["businesses.view_all"])
        expect(await access.audits.countDocuments({ action: "role.permissions_migrated", targetId: String(legacy._id) })).toBe(1)
        // O administrador tira um módulo: a migração não roda de novo.
        await access.roles.updateOne({ _id: legacy._id }, { $set: { permissoes: ["businesses.use", "clients.view"] } })
        expect(await expandBusinessPermissions()).toBe(0)
        expect((await access.roles.findById(legacy._id).lean().orFail()).permissoes).toEqual(["businesses.use", "clients.view"])
        expect(await mongoose.connection.collection("app_migrations").findOne({ _id: EXPAND_BUSINESS_PERMISSIONS_MIGRATION as never })).toBeTruthy()
    })
})
