import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server-core"

vi.mock("@/lib/db", async (original) => ({ ...(await original<object>()), dbConnect: vi.fn(async () => undefined) }))
vi.mock("ai", () => ({ dynamicTool: (def: unknown) => def }))
const pusher = vi.hoisted(() => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/lib/pusher/channels", () => ({ ...pusher, integrationChannel: (id: string) => `private-integration-${id}` }))
const storage = vi.hoisted(() => ({
    copyFile: vi.fn(async () => undefined),
    deleteFile: vi.fn(async () => undefined),
    getUploadUrl: vi.fn(async (key: string) => `https://s3.local/${key}?assinado`),
    headFile: vi.fn(async () => ({ contentLength: 2048, contentType: "application/pdf", lastModified: new Date() })),
}))
vi.mock("@/lib/storage/s3", async (original) => ({ ...(await original<object>()), ...storage }))
const chat = vi.hoisted(() => ({ loadSessionFile: vi.fn() }))
vi.mock("@/features/opex-agent/server/files", async (original) => ({ ...(await original<object>()), loadSessionFile: chat.loadSessionFile }))

import { BUSINESS_FULL_PERMISSIONS } from "@/features/businesses/permissions"
import { accessModels } from "@/features/access/server/models"
import { createRole } from "@/features/access/server/commands"
import { resolveAccess } from "@/features/access/server/access"
import { requestAccess, type AccessContext } from "@/features/access/server/context"
import { businessModels } from "@/features/businesses/server/models"
import { archiveBusiness, deleteBusiness, getBusinessDetail, updateBusiness } from "@/features/businesses/server/businesses"
import { archiveActivity, createActivity, deleteActivity, getActivity, listActivities, restoreActivity, updateActivity } from "@/features/businesses/server/activities"
import { archiveGoal, createGoal, deleteGoal, ensureGoalIndexes, getCurrentGoal, listGoals, restoreGoal, updateGoal } from "@/features/businesses/server/goals"
import { goalActiveIn, monthlyTargetOf } from "@/features/businesses/server/dashboard"
import { monthWindow } from "@/features/businesses/goal-progress"
import { completeBusinessFile, cleanupPendingBusinessFiles, reserveBusinessFile } from "@/features/businesses/server/files"
import { archiveDocument, createDocument, deleteDocument, listDocuments, updateDocument } from "@/features/businesses/server/documents"
import { createSuccess, updateSuccess } from "@/features/businesses/server/successes"
import { categorySuggestions, purgeArchivedItems } from "@/features/businesses/server/items"
import { removeBusinessLogo, setBusinessLogo } from "@/features/businesses/server/space"
import { getBusinessDashboard } from "@/features/businesses/server/dashboard"
import { platformModels } from "@/features/platform/server/models"
import { findOpexTool } from "@/features/opex-agent/server/tools/registry"
import { scopeOfAccess } from "@/features/opex-agent/server/scope"

/** Espaço do negócio (M2) contra os serviços reais (MongoMemoryReplSet efêmero; nunca o banco real). */

let replica: MongoMemoryReplSet
let admin: AccessContext
const access = accessModels()
const business = businessModels()
const platform = platformModels()

const role = (nome: string, permissoes: string[]) => createRole(admin, { nome, descricao: "", cor: "azul", ativo: true, permissoes, limiteNegocios: null })
async function user(name: string, roles: string[]) {
    const created = await access.users.create({ name, email: `${name.toLowerCase()}@example.test`, active: true, roles })
    return resolveAccess(created.id as string)
}
const viewAsUser = (userId: string) => Buffer.from(JSON.stringify({ tipo: "usuario", userId })).toString("base64url")

async function businessOf(owner: AccessContext, name = "Studio Aurora") {
    const doc = await business.businesses.create({ ownerId: owner.userId, number: 1, name, status: "active", archivedAt: null, createdBy: owner.userId, updatedBy: owner.userId })
    return doc._id.toString()
}

async function uploaded(owner: AccessContext, businessId: string, purpose: "document" | "success" | "logo", name = "contrato.pdf", mediaType = "application/pdf") {
    const reservation = await reserveBusinessFile(owner, businessId, { purpose, name, size: 2048, mediaType })
    await completeBusinessFile(owner, businessId, reservation.id)
    return reservation.id
}

beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.18" }, replSet: { count: 1 }, instanceOpts: [{ ip: "127.0.0.1" }] })
    await mongoose.connect(replica.getUri("ciliar_business_space_test"))
    await Promise.all([...Object.values(access), ...Object.values(business), ...Object.values(platform)].map((model) => model.init()))
    await ensureGoalIndexes()
}, 120_000)
beforeEach(async () => {
    vi.clearAllMocks()
    await Promise.all([...Object.values(access), ...Object.values(business), ...Object.values(platform)].map((model) => model.deleteMany({})))
    const adminRole = await access.roles.create({ slug: "admin", nome: "Administrador", permissoes: ["*"], ativo: true })
    const created = await access.users.create({ name: "Admin", email: "admin@example.test", active: true, roles: [adminRole.id] })
    admin = await resolveAccess(created.id as string)
})
afterAll(async () => {
    await mongoose.disconnect()
    await replica?.stop()
})

describe("ficha, tema e logo", () => {
    it("edita tema, contato e prazos; e-mail vazio usa o da conta; moeda avisa os valores não convertidos", async () => {
        const provider = (await role("Prestador", [...BUSINESS_FULL_PERMISSIONS])).id
        const ana = await user("Ana", [provider])
        const id = await businessOf(ana)
        const detail = await getBusinessDetail(ana, id)
        expect(detail).toMatchObject({ theme: { primaryColor: "#0B57C4", mode: "dark" }, deadlineAlertDays: 3, quoteValidityDays: 15, contactEmail: null, accountEmail: "ana@example.test", currencyLocked: false, editable: true, own: true })
        await createActivity(ana, id, { name: "Consultoria", hourlyRateCents: 15000 })
        const updated = await updateBusiness(ana, id, { theme: { primaryColor: "#ff6600", mode: "light" }, contactPhone: "(11) 99999-0000", deadlineAlertDays: 5, quoteValidityDays: 30, currency: "USD", version: detail.version })
        expect(updated).toMatchObject({ theme: { primaryColor: "#FF6600", mode: "light" }, contactPhone: "(11) 99999-0000", deadlineAlertDays: 5, quoteValidityDays: 30, currency: "USD", valuedItems: { activities: 1, goals: 0 } })
        // O valor da atividade não é convertido.
        expect((await listActivities(ana, id)).items[0]!.hourlyRateCents).toBe(15000)
        const audit = await access.audits.findOne({ action: "business.update" }).lean().orFail()
        expect(audit.after).toMatchObject({ theme: { primaryColor: "#FF6600", mode: "light" } })
    })

    it("troca e remove a logo (só imagem; a anterior sai do storage)", async () => {
        const provider = (await role("Prestador", [...BUSINESS_FULL_PERMISSIONS])).id
        const bia = await user("Bia", [provider])
        const id = await businessOf(bia)
        await expect(reserveBusinessFile(bia, id, { purpose: "logo", name: "logo.pdf", size: 10, mediaType: "application/pdf" })).rejects.toMatchObject({ code: "BUSINESS_FILE_TYPE" })
        const first = await uploaded(bia, id, "logo", "logo.png", "image/png")
        const withLogo = await setBusinessLogo(bia, id, { fileId: first })
        expect(withLogo.logo).toMatchObject({ name: "logo.png", mediaType: "image/png" })
        const second = await uploaded(bia, id, "logo", "nova.png", "image/png")
        await setBusinessLogo(bia, id, { fileId: second })
        expect(storage.deleteFile).toHaveBeenCalledWith(`businesses/${id}/files/${first}/logo.png`)
        expect((await removeBusinessLogo(bia, id)).logo).toBeNull()
        expect(await access.audits.countDocuments({ action: { $in: ["business.logo.update", "business.logo.remove"] } })).toBe(3)
    })
})

describe("atividades", () => {
    it("CRUD com histórico do valor/hora, versão otimista, categorias e arquivamento", async () => {
        const provider = (await role("Prestador", [...BUSINESS_FULL_PERMISSIONS])).id
        const caio = await user("Caio", [provider])
        const id = await businessOf(caio)
        const created = await createActivity(caio, id, { name: "Fotografia", category: "Eventos", hourlyRateCents: 20000 })
        expect(created.priceHistory).toEqual([expect.objectContaining({ fromCents: null, toCents: 20000, actorName: "Caio" })])
        await expect(createActivity(caio, id, { name: "Errada", hourlyRateCents: -1 })).rejects.toMatchObject({ status: 400 })

        const updated = await updateActivity(caio, id, created.id, { hourlyRateCents: 25000, active: false, version: 0 })
        expect(updated).toMatchObject({ hourlyRateCents: 25000, active: false, version: 1 })
        expect(updated.priceHistory.map((entry) => [entry.fromCents, entry.toCents])).toEqual([[20000, 25000], [null, 20000]])
        await expect(updateActivity(caio, id, created.id, { name: "X", version: 0 })).rejects.toMatchObject({ code: "VERSION_CONFLICT" })
        // Mudar só o nome não grava preço.
        await updateActivity(caio, id, created.id, { name: "Fotografia de eventos", version: 1 })
        expect((await getActivity(caio, id, created.id)).priceHistory).toHaveLength(2)
        const audit = await access.audits.findOne({ action: "business.activity.update" }).sort({ _id: 1 }).lean().orFail()
        expect(audit.before).toMatchObject({ hourlyRateCents: 20000 })
        expect(audit.after).toMatchObject({ hourlyRateCents: 25000 })

        await createActivity(caio, id, { name: "Vídeo", category: "Audiovisual", hourlyRateCents: 0 })
        expect(await categorySuggestions(caio, id, "activities")).toEqual(["Audiovisual", "Eventos"])

        await expect(deleteActivity(caio, id, created.id)).rejects.toMatchObject({ code: "ITEM_NOT_ARCHIVED" })
        const archived = await archiveActivity(caio, id, created.id)
        expect(archived.status).toBe("archived")
        expect(archived.purgeAt).not.toBeNull()
        await expect(updateActivity(caio, id, created.id, { name: "Y", version: archived.version })).rejects.toMatchObject({ code: "ITEM_ARCHIVED" })
        expect((await listActivities(caio, id, "active")).items.map((item) => item.name)).toEqual(["Vídeo"])
        await restoreActivity(caio, id, created.id)
        await archiveActivity(caio, id, created.id)
        await deleteActivity(caio, id, created.id)
        expect(await business.activityPrices.countDocuments({ activityId: created.id })).toBe(0)
        expect(await access.audits.countDocuments({ action: { $regex: /^business\.activity\./ } })).toBeGreaterThanOrEqual(7)
        expect(pusher.publishToChannels).toHaveBeenCalledWith([`private-businesses-${caio.userId}`], "business-space-updated", { businessId: id, kind: "activities" })
    })

    it("isolamento, suporte somente leitura (auditado), negócio arquivado e simulação de usuário", async () => {
        const provider = (await role("Prestador", [...BUSINESS_FULL_PERMISSIONS])).id
        const support = (await role("Suporte", ["businesses.view_all"])).id
        const dani = await user("Dani", [provider])
        const edu = await user("Edu", [provider])
        const help = await user("Help", [support])
        const id = await businessOf(dani)
        const activity = await createActivity(dani, id, { name: "Aula", hourlyRateCents: 9000 })

        await expect(listActivities(edu, id)).rejects.toMatchObject({ status: 404 })
        await expect(createActivity(edu, id, { name: "Invasão", hourlyRateCents: 1 })).rejects.toMatchObject({ status: 404 })
        const read = await listActivities(help, id)
        expect(read).toMatchObject({ editable: false, items: [expect.objectContaining({ name: "Aula" })] })
        expect(await access.audits.countDocuments({ action: "business.support_view", actorId: help.userId, "after.section": "activities" })).toBe(1)
        await expect(updateActivity(help, id, activity.id, { name: "X", version: 0 })).rejects.toMatchObject({ status: 403 })

        const simulated = await resolveAccess(admin.userId, viewAsUser(dani.userId))
        const viaSimulation = await createActivity(simulated, id, { name: "Mentoria", hourlyRateCents: 30000 })
        expect(await business.activities.findById(viaSimulation.id).lean()).toMatchObject({ ownerId: dani.userId, createdBy: admin.userId })
        const audit = await access.audits.findOne({ action: "business.activity.create", targetId: viaSimulation.id }).lean().orFail()
        expect(audit.actorId).toBe(admin.userId)
        expect(audit.simulation).toMatchObject({ tipo: "usuario", alvoId: dani.userId })

        await archiveBusiness(dani, id)
        expect((await listActivities(dani, id)).editable).toBe(false)
        await expect(createActivity(dani, id, { name: "Nova", hourlyRateCents: 1 })).rejects.toMatchObject({ code: "BUSINESS_ARCHIVED" })
    })
})

describe("metas: uma ativa por negócio, linha do tempo e dashboard", () => {
    it("criar substitui a atual; editar cria nova versão (sem mudança, nada grava); histórico é somente leitura", async () => {
        const provider = (await role("Prestador", [...BUSINESS_FULL_PERMISSIONS])).id
        const fabi = await user("Fabi", [provider])
        const id = await businessOf(fabi)
        const monthly = await createGoal(fabi, id, { name: "Mensal", targetCents: 800000, period: "month", mode: "recurring" }, "America/Sao_Paulo")
        expect(monthly).toMatchObject({ status: "active", supersededAt: null, activePeriods: [{ to: null }] })
        expect(monthly.progress).toMatchObject({ status: "active", current: { revenueCents: 0, achievedCents: 0, percent: 0, available: true }, history: [] })
        await expect(createGoal(fabi, id, { targetCents: 100, period: "hour" })).rejects.toMatchObject({ status: 400 })

        const hourly = await createGoal(fabi, id, { targetCents: 15000, period: "hour", measure: "range", from: "2026-01-01", to: "2026-12-31" })
        expect(hourly.progress.current).toMatchObject({ available: false, achievedCents: null })
        let overview = await listGoals(fabi, id)
        expect(overview.current?.id).toBe(hourly.id)
        expect(overview.history).toEqual([expect.objectContaining({ id: monthly.id, status: "superseded", supersededReason: "new", activePeriods: [expect.objectContaining({ to: expect.any(String) })] })])
        expect(await business.goals.countDocuments({ businessId: id, status: "active" })).toBe(1)

        // Histórico: somente leitura.
        await expect(updateGoal(fabi, id, monthly.id, { targetCents: 1, period: "month", mode: "recurring", version: 1 })).rejects.toMatchObject({ code: "GOAL_NOT_CURRENT" })
        await expect(archiveGoal(fabi, id, monthly.id)).rejects.toMatchObject({ code: "GOAL_NOT_CURRENT" })
        await expect(restoreGoal(fabi, id, monthly.id)).rejects.toMatchObject({ code: "GOAL_NOT_CURRENT" })
        await expect(deleteGoal(fabi, id, monthly.id)).rejects.toMatchObject({ code: "ITEM_NOT_ARCHIVED" })

        // Editar = nova versão; mesma versão de novo dá conflito; sem mudança não grava.
        const same = await updateGoal(fabi, id, hourly.id, { targetCents: 15000, period: "hour", measure: "range", from: "2026-01-01", to: "2026-12-31", version: 0 })
        expect(same.id).toBe(hourly.id)
        const edited = await updateGoal(fabi, id, hourly.id, { name: "Anual", targetCents: 9_600_000, period: "year", mode: "specific", year: 2030, version: 0 })
        expect(edited).toMatchObject({ status: "active", period: "year", year: 2030, version: 0, progress: { status: "upcoming" } })
        expect(edited.id).not.toBe(hourly.id)
        await expect(updateGoal(fabi, id, edited.id, { targetCents: 1, period: "month", mode: "recurring", version: 7 })).rejects.toMatchObject({ code: "VERSION_CONFLICT" })
        overview = await listGoals(fabi, id)
        expect(overview.current?.id).toBe(edited.id)
        expect(overview.history.map((goal) => [goal.id, goal.supersededReason])).toEqual([
            [hourly.id, "edit"],
            [monthly.id, "new"],
        ])
        expect((await access.audits.findOne({ action: "business.goal.update" }).lean())?.before).toMatchObject({ goalId: hourly.id, period: "hour" })

        const dashboard = await getBusinessDashboard(fabi, id, { timeZone: "Europe/Lisbon" })
        expect(dashboard).toMatchObject({ timeZone: "Europe/Lisbon", period: "month", goal: { id: edited.id }, counts: { goals: 1 }, kpis: { currentGoalPercent: 0, revenueCents: 0 }, charts: { hasRevenue: false } })
        expect(await access.audits.countDocuments({ action: "business.goal.create" })).toBe(2)
    })

    it("arquivar a atual reativa a anterior (em cadeia, até ficar sem meta); restaurar torna a arquivada a atual", async () => {
        const provider = (await role("Prestador", [...BUSINESS_FULL_PERMISSIONS])).id
        const gil = await user("Gil", [provider])
        const id = await businessOf(gil)
        const a = await createGoal(gil, id, { name: "A", targetCents: 100, period: "month", mode: "recurring" })
        const b = await createGoal(gil, id, { name: "B", targetCents: 200, period: "month", mode: "recurring" })
        const c = await createGoal(gil, id, { name: "C", targetCents: 300, period: "month", mode: "recurring" })

        const first = await archiveGoal(gil, id, c.id)
        expect(first.archived).toMatchObject({ id: c.id, status: "archived", purgeAt: expect.any(String) })
        expect(first.current).toMatchObject({ id: b.id, status: "active", supersededReason: null })
        expect(first.current?.activePeriods).toHaveLength(2)
        expect((await archiveGoal(gil, id, b.id)).current?.id).toBe(a.id)
        const last = await archiveGoal(gil, id, a.id)
        expect(last.current).toBeNull()
        expect(await getCurrentGoal(gil, id)).toBeNull()
        expect((await getBusinessDashboard(gil, id)).goal).toBeNull()
        expect((await access.audits.findOne({ action: "business.goal.archive", targetId: c.id }).lean())?.after).toMatchObject({ reactivated: b.id })

        // Restaurar B (arquivada) como a atual; depois C substitui B (motivo restore).
        expect(await restoreGoal(gil, id, b.id)).toMatchObject({ id: b.id, status: "active", archivedAt: null })
        await restoreGoal(gil, id, c.id)
        const overview = await listGoals(gil, id)
        expect(overview.current?.id).toBe(c.id)
        expect(overview.history.find((goal) => goal.id === b.id)).toMatchObject({ status: "superseded", supersededReason: "restore" })
        await expect(restoreGoal(gil, id, c.id)).rejects.toMatchObject({ code: "ITEM_ACTIVE" })
        // Arquivar C volta para B (a substituída mais recente).
        expect((await archiveGoal(gil, id, c.id)).current?.id).toBe(b.id)
        await deleteGoal(gil, id, c.id)
        expect(await business.goals.exists({ _id: c.id })).toBeNull()
    })

    it("índice único: no máximo uma meta ativa por negócio; a migração normaliza os dados antigos", async () => {
        const provider = (await role("Prestador", [...BUSINESS_FULL_PERMISSIONS])).id
        const hugo = await user("Hugo", [provider])
        const id = await businessOf(hugo)
        await createGoal(hugo, id, { targetCents: 100, period: "month", mode: "recurring" })
        await expect(business.goals.collection.insertOne({ businessId: id, ownerId: hugo.userId, status: "active", targetCents: 1, period: "month" })).rejects.toMatchObject({ code: 11000 })

        // Dados antigos: várias ativas, sem `activePeriods`.
        await business.goals.collection.dropIndex("one_active_goal_per_business")
        await business.goals.deleteMany({})
        const older = new Date("2026-01-10T12:00:00Z")
        const newer = new Date("2026-03-05T12:00:00Z")
        const archivedAt = new Date("2026-02-01T12:00:00Z")
        await business.goals.collection.insertMany([
            { businessId: id, ownerId: hugo.userId, status: "active", targetCents: 1, period: "month", mode: "recurring", createdBy: "x", createdAt: older, updatedAt: older },
            { businessId: id, ownerId: hugo.userId, status: "active", targetCents: 2, period: "month", mode: "recurring", createdBy: "x", createdAt: newer, updatedAt: newer },
            { businessId: id, ownerId: hugo.userId, status: "archived", archivedAt, targetCents: 3, period: "year", mode: "recurring", createdBy: "x", createdAt: older, updatedAt: archivedAt },
        ])
        expect(await ensureGoalIndexes()).toEqual({ superseded: 1, backfilled: 2 })
        const goals = await business.goals.find({ businessId: id }).sort({ targetCents: 1 }).lean()
        expect(goals.map((goal) => goal.status)).toEqual(["superseded", "active", "archived"])
        expect(goals[0]).toMatchObject({ supersededAt: newer, supersededReason: "new", activePeriods: [{ from: older, to: newer }] })
        expect(goals[1]!.activePeriods).toEqual([{ from: newer, to: null }])
        expect(goals[2]!.activePeriods).toEqual([{ from: older, to: archivedAt }])
        expect(await ensureGoalIndexes()).toEqual({ superseded: 0, backfilled: 0 })
    })

    it("faturamento × meta: a meta mensal que valia em cada mês, pela linha do tempo", () => {
        const at = (iso: string) => new Date(iso)
        const goal = (name: string, periods: { from: string; to: string | null }[], extra: Record<string, unknown> = {}) => ({
            name,
            period: "month" as const,
            mode: "recurring" as const,
            month: null,
            targetCents: 100,
            status: "superseded" as const,
            createdAt: at(periods[0]!.from),
            updatedAt: at(periods[0]!.from),
            supersededAt: null,
            archivedAt: null,
            activePeriods: periods.map((period) => ({ from: at(period.from), to: period.to ? at(period.to) : null })),
            ...extra,
        })
        const jan = goal("jan", [{ from: "2026-01-01T12:00:00Z", to: "2026-02-10T12:00:00Z" }])
        const feb = goal("feb", [{ from: "2026-02-10T12:00:00Z", to: null }], { status: "active", targetCents: 500 })
        const goals = [jan, feb]
        const now = at("2026-04-15T12:00:00Z")
        expect(goalActiveIn(goals, monthWindow(2026, 1), "UTC", now)?.name).toBe("jan")
        expect(goalActiveIn(goals, monthWindow(2026, 2), "UTC", now)?.name).toBe("feb")
        expect(goalActiveIn(goals, monthWindow(2025, 12), "UTC", now)).toBeNull()
        expect(monthlyTargetOf({ period: "month", mode: "specific", month: "2026-02", targetCents: 9 }, "2026-03")).toBe(0)
        expect(monthlyTargetOf({ period: "year", mode: "recurring", month: null, targetCents: 9 }, "2026-03")).toBe(0)
        expect(monthlyTargetOf(feb, "2026-03")).toBe(500)
    })
})

describe("documentos, sucessos e arquivos", () => {
    it("envio com limites da Plataforma, documento com troca de arquivo e exclusão que limpa o storage", async () => {
        const provider = (await role("Prestador", [...BUSINESS_FULL_PERMISSIONS])).id
        const gil = await user("Gil", [provider])
        const id = await businessOf(gil)
        await platform.settings.create({ _id: "global", defaultRoleId: null, retentionDays: { businesses: 30, activities: 30, goals: 30, documents: 30, successes: 30, clients: 30, jobs: 30, portfolioItems: 30 }, documents: { maxFileSizeMb: 1, allowedTypes: ["pdf"] }, version: 1 })
        await expect(reserveBusinessFile(gil, id, { purpose: "document", name: "foto.png", size: 10, mediaType: "image/png" })).rejects.toMatchObject({ code: "BUSINESS_FILE_TYPE" })
        await expect(reserveBusinessFile(gil, id, { purpose: "document", name: "grande.pdf", size: 2 * 1024 * 1024, mediaType: "application/pdf" })).rejects.toMatchObject({ code: "BUSINESS_FILE_TOO_LARGE" })
        storage.headFile.mockResolvedValueOnce({ contentLength: 5 * 1024 * 1024, contentType: "application/pdf", lastModified: new Date() })
        const lying = await reserveBusinessFile(gil, id, { purpose: "document", name: "mentira.pdf", size: 100, mediaType: "application/pdf" })
        await expect(completeBusinessFile(gil, id, lying.id)).rejects.toMatchObject({ code: "BUSINESS_FILE_TOO_LARGE" })

        const fileId = await uploaded(gil, id, "document")
        expect(storage.copyFile).toHaveBeenCalledWith(`businesses/tmp/${fileId}/contrato.pdf`, `businesses/${id}/files/${fileId}/contrato.pdf`)
        const document = await createDocument(gil, id, { name: "Contrato padrão", category: "Contratos", portfolio: true, fileId })
        expect(document).toMatchObject({ name: "Contrato padrão", portfolio: true, file: { id: fileId, name: "contrato.pdf", url: `/api/businesses/${id}/files/${fileId}` } })
        await expect(createDocument(gil, id, { name: "Reuso", fileId })).rejects.toMatchObject({ code: "BUSINESS_FILE_NOT_FOUND" })

        const replacement = await uploaded(gil, id, "document", "contrato-v2.pdf")
        const replaced = await updateDocument(gil, id, document.id, { fileId: replacement, version: 0 })
        expect(replaced.file.name).toBe("contrato-v2.pdf")
        expect(storage.deleteFile).toHaveBeenCalledWith(`businesses/${id}/files/${fileId}/contrato.pdf`)
        expect(await categorySuggestions(gil, id, "documents")).toEqual(["Contratos"])

        await archiveDocument(gil, id, document.id)
        await deleteDocument(gil, id, document.id)
        expect(storage.deleteFile).toHaveBeenCalledWith(`businesses/${id}/files/${replacement}/contrato-v2.pdf`)
        expect(await business.files.countDocuments({ businessId: id, itemId: document.id })).toBe(0)
        expect((await listDocuments(gil, id)).items).toHaveLength(0)
    })

    it("sucesso: anexos adicionados e removidos; excluir o negócio leva todos os itens e arquivos", async () => {
        const provider = (await role("Prestador", [...BUSINESS_FULL_PERMISSIONS])).id
        const ivo = await user("Ivo", [provider])
        const id = await businessOf(ivo)
        const first = await uploaded(ivo, id, "success", "antes.pdf")
        const success = await createSuccess(ivo, id, { title: "Loja nova", date: "2026-09-10", result: "aumentou as vendas em 30%", attachmentIds: [first] })
        expect(success.attachments.map((file) => file.name)).toEqual(["antes.pdf"])
        const second = await uploaded(ivo, id, "success", "depois.pdf")
        const updated = await updateSuccess(ivo, id, success.id, { attachmentIds: [second], version: 0 })
        expect(updated.attachments.map((file) => file.name)).toEqual(["depois.pdf"])
        expect(storage.deleteFile).toHaveBeenCalledWith(`businesses/${id}/files/${first}/antes.pdf`)
        // Arquivo de documento não vira anexo de sucesso.
        const doc = await uploaded(ivo, id, "document")
        await expect(updateSuccess(ivo, id, success.id, { attachmentIds: [second, doc], version: 1 })).rejects.toMatchObject({ code: "BUSINESS_FILE_NOT_FOUND" })

        await createActivity(ivo, id, { name: "Aula", hourlyRateCents: 100 })
        await createGoal(ivo, id, { targetCents: 100, period: "year", mode: "recurring" })
        await archiveBusiness(ivo, id)
        await deleteBusiness(ivo, id)
        for (const model of [business.activities, business.activityPrices, business.goals, business.documents, business.successes, business.files]) expect(await model.countDocuments({ businessId: id })).toBe(0)
        expect(storage.deleteFile).toHaveBeenCalledWith(`businesses/${id}/files/${second}/depois.pdf`)
    })
})

describe("gráficos do dashboard", () => {
    it("agrega categorias, ranking e evolução do valor/hora, sucessos por ponto e faturamento × meta mensal", async () => {
        const provider = (await role("Prestador", [...BUSINESS_FULL_PERMISSIONS])).id
        const lia = await user("Lia", [provider])
        const id = await businessOf(lia)
        const photo = await createActivity(lia, id, { name: "Fotografia", category: "Eventos", hourlyRateCents: 20000 })
        await createActivity(lia, id, { name: "Vídeo", category: "Eventos", hourlyRateCents: 30000 })
        await createActivity(lia, id, { name: "Aula", hourlyRateCents: 10000 })
        await updateActivity(lia, id, photo.id, { hourlyRateCents: 25000, version: 0 })
        await createGoal(lia, id, { name: "Mensal", targetCents: 500000, period: "month", mode: "recurring" })
        const today = new Date().toISOString().slice(0, 10)
        await createSuccess(lia, id, { title: "Hoje", date: today })
        await createSuccess(lia, id, { title: "Antigo", date: "2020-01-10" })

        const month = await getBusinessDashboard(lia, id, { period: "month", timeZone: "UTC" })
        expect(month.kpis).toMatchObject({ activeActivities: 3, averageRateCents: 21667, successesInPeriod: 1, revenueCents: 0 })
        expect(month.charts.activityRates.map((row) => row.name)).toEqual(["Vídeo", "Fotografia", "Aula"])
        expect(month.charts.activitiesByCategory).toEqual([{ name: "Eventos", count: 2 }, { name: "Sem categoria", count: 1 }])
        expect(month.charts.successes.at(-1)).toEqual({ bucket: today, count: 1 })
        expect(month.charts.rateTrend.activities.map((activity) => activity.name)).toEqual(["Vídeo", "Fotografia", "Aula"])
        expect(month.charts.rateTrend.rows.at(-1)).toMatchObject({ bucket: today, a0: 30000, a1: 25000, a2: 10000 })
        expect(month.charts.revenue).toEqual([{ bucket: today.slice(0, 7), revenueCents: 0, targetCents: 500000 }])
        expect(month.charts).toMatchObject({ hasRevenue: false })
        expect(month).toMatchObject({ goal: { name: "Mensal" }, kpis: { currentGoalPercent: 0 } })

        const year = await getBusinessDashboard(lia, id, { period: "12m", timeZone: "UTC" })
        expect(year).toMatchObject({ granularity: "month", period: "12m" })
        expect(year.charts.successes).toHaveLength(12)
        expect(year.charts.revenue).toHaveLength(12)
    })
})

describe("rotina businesses-purge (itens)", () => {
    it("exclui cada tipo pelo próprio prazo e limpa os envios pendentes de mais de 24 h", async () => {
        const provider = (await role("Prestador", [...BUSINESS_FULL_PERMISSIONS])).id
        const joa = await user("Joa", [provider])
        const id = await businessOf(joa)
        await platform.settings.create({ _id: "global", defaultRoleId: null, retentionDays: { businesses: 30, activities: 5, goals: 60, documents: 30, successes: 30, clients: 30, jobs: 30, portfolioItems: 30 }, documents: { maxFileSizeMb: 25, allowedTypes: ["pdf", "images", "office", "text"] }, version: 1 })
        const activity = await createActivity(joa, id, { name: "Antiga", hourlyRateCents: 100 })
        const goal = await createGoal(joa, id, { targetCents: 100, period: "month", mode: "recurring" })
        await archiveActivity(joa, id, activity.id)
        await archiveGoal(joa, id, goal.id)
        const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000)
        await business.activities.updateOne({ _id: activity.id }, { $set: { archivedAt: tenDaysAgo } })
        await business.goals.updateOne({ _id: goal.id }, { $set: { archivedAt: tenDaysAgo } })
        const pending = await reserveBusinessFile(joa, id, { purpose: "document", name: "esquecido.pdf", size: 10, mediaType: "application/pdf" })
        await business.files.collection.updateOne({ _id: new mongoose.Types.ObjectId(pending.id) }, { $set: { createdAt: new Date(Date.now() - 25 * 3_600_000) } })

        expect(await purgeArchivedItems()).toBe("Itens excluídos definitivamente: 1 atividades")
        expect(await business.activities.exists({ _id: activity.id })).toBeNull()
        expect(await business.activityPrices.countDocuments({ activityId: activity.id })).toBe(0)
        expect(await business.goals.exists({ _id: goal.id })).not.toBeNull()
        expect(await access.audits.countDocuments({ action: "business.activity.purge", actorId: "system:businesses-purge" })).toBe(1)
        expect(await cleanupPendingBusinessFiles()).toBe(1)
        expect(await business.files.exists({ _id: pending.id })).toBeNull()
    })
})

describe("ferramentas do Agente Opex", () => {
    it("atividades, metas, documentos e sucessos chamam os serviços reais (arquivos do chat copiados)", async () => {
        const provider = (await role("Prestador", [...BUSINESS_FULL_PERMISSIONS, "opex.use"])).id
        const kai = await user("Kai", [provider])
        const id = await businessOf(kai)
        const scope = { ...scopeOfAccess(kai), timeZone: "Europe/Lisbon" }
        const run = (name: string, raw: unknown) => {
            const tool = findOpexTool(name)!
            const input = tool.input.parse(raw)
            return requestAccess.run(kai, () => tool.execute(input, { sessionId: "s".repeat(24), actorId: kai.userId, scope, access: kai })) as Promise<Record<string, unknown>>
        }
        const activity = await run("create_activity", { businessId: id, name: "Consultoria", hourlyRateCents: 15000 })
        expect(activity).toMatchObject({ name: "Consultoria", hourlyRate: expect.stringContaining("150,00") })
        await run("update_activity", { businessId: id, activityId: activity.id, hourlyRateCents: 18000 })
        expect(((await run("get_activity", { businessId: id, activityId: activity.id })).priceHistory as unknown[]).length).toBe(2)

        const goal = await run("create_goal", { businessId: id, targetCents: 500000, period: "month", mode: "recurring" })
        expect(goal).toMatchObject({ period: "month", progress: { status: "active", current: { revenue: expect.stringContaining("0,00"), percent: 0 } } })
        expect(await run("list_goals", { businessId: id })).toMatchObject({ current: { id: goal.id }, timeline: [] })
        const second = await run("create_goal", { businessId: id, targetCents: 900000, period: "month", mode: "recurring" })
        expect(await run("get_current_goal", { businessId: id })).toMatchObject({ current: { id: second.id } })
        expect(await run("archive_goal", { businessId: id, goalId: second.id })).toMatchObject({ archived: { status: "archived" }, current: { id: goal.id } })
        expect(await run("list_goals", { businessId: id })).toMatchObject({ current: { id: goal.id }, timeline: [{ id: second.id, status: "archived" }] })

        chat.loadSessionFile.mockResolvedValue({ key: "opex/sessions/x/proposta.pdf", name: "proposta.pdf", mediaType: "application/pdf", size: 4096 })
        const document = await run("create_document", { businessId: id, fileId: "f".repeat(24), name: "Proposta modelo" })
        expect(document).toMatchObject({ name: "Proposta modelo", file: { name: "proposta.pdf" } })
        expect(storage.copyFile).toHaveBeenCalledWith("opex/sessions/x/proposta.pdf", expect.stringMatching(new RegExp(`^businesses/${id}/files/[a-f\\d]{24}/proposta.pdf$`)))

        const success = await run("create_success", { businessId: id, title: "Case", fileIds: ["f".repeat(24)] })
        expect((success.attachments as unknown[]).length).toBe(1)
        const attachmentId = (success.attachments as { id: string }[])[0]!.id
        expect(((await run("update_success", { businessId: id, successId: success.id, removeAttachmentIds: [attachmentId] })).attachments as unknown[]).length).toBe(0)

        chat.loadSessionFile.mockResolvedValue({ key: "opex/sessions/x/logo.png", name: "logo.png", mediaType: "image/png", size: 1024 })
        expect(await run("set_business_logo", { businessId: id, fileId: "f".repeat(24) })).toMatchObject({ logo: { name: "logo.png" } })
        expect(await run("update_business", { businessId: id, removeLogo: true, theme: { primaryColor: "#123456", mode: "light" } })).toMatchObject({ logo: null, theme: { primaryColor: "#123456", mode: "light" } })
        await expect(run("delete_activity", { businessId: id, activityId: activity.id })).rejects.toMatchObject({ code: "ITEM_NOT_ARCHIVED" })
    })
})
