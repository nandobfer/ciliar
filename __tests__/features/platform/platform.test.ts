import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server-core"

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined) }))

import { accessModels } from "@/features/access/server/models"
import { createRole } from "@/features/access/server/commands"
import { resolveAccess } from "@/features/access/server/access"
import type { AccessContext } from "@/features/access/server/context"
import { platformModels } from "@/features/platform/server/models"
import { getPlatformSettings, signupAvailability, updatePlatformSettings } from "@/features/platform/server/settings"
import { acceptLegal, getLegalOverview, getMyLegal, publishLegalVersion } from "@/features/platform/server/legal"
import { DEFAULT_PLATFORM_SETTINGS, platformSettingsSchema } from "@/features/platform/schemas"
import { DEFAULT_RETENTION_DAYS, RETENTION_TYPES } from "@/features/platform/constants"
import { routePermissions } from "@/features/access/server/policy"

/** Configuração da plataforma e termos versionados (MongoMemoryReplSet efêmero; nunca o banco real). */
let replica: MongoMemoryReplSet
let admin: AccessContext
let adminRoleId: string
const models = accessModels()
const platform = platformModels()
const roleData = (nome: string, permissoes = ["admin.access"]) => ({ nome, descricao: "", cor: "azul", ativo: true, permissoes })
const legal = (suffix = "") => ({ termsOfUse: `# Termos${suffix}`, privacyPolicy: `# Privacidade${suffix}`, notes: "" })
const save = (context: AccessContext, patch: Record<string, unknown>, version = 0) => updatePlatformSettings(context, { ...DEFAULT_PLATFORM_SETTINGS, ...patch, version })

beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.18" }, replSet: { count: 1 }, instanceOpts: [{ ip: "127.0.0.1" }] })
    await mongoose.connect(replica.getUri("ciliar_platform_test"))
    await Promise.all([...Object.values(models), ...Object.values(platform)].map((model) => model.init()))
}, 120_000)
beforeEach(async () => {
    await Promise.all([...Object.values(models), ...Object.values(platform)].map((model) => model.deleteMany({})))
    const role = await models.roles.create({ slug: "admin", nome: "Administrador", permissoes: ["*"], ativo: true })
    adminRoleId = role.id as string
    const user = await models.users.create({ name: "Admin", email: "admin@example.test", active: true, roles: [role.id] })
    admin = await resolveAccess(user.id as string, "none", null, 0)
})
afterAll(async () => {
    await mongoose.disconnect()
    await replica?.stop()
})

describe("configuração da plataforma", () => {
    it("parte dos padrões: sem perfil padrão, 30 dias por tipo e documentos de 25 MB", async () => {
        const dto = await getPlatformSettings(admin)
        expect(dto.settings.defaultRoleId).toBeNull()
        for (const type of RETENTION_TYPES) expect(dto.settings.retentionDays[type]).toBe(DEFAULT_RETENTION_DAYS)
        expect(dto.settings.documents).toEqual({ maxFileSizeMb: 25, allowedTypes: ["pdf", "images", "office", "text"] })
        expect(dto.signup).toMatchObject({ available: false, reason: "no-default-role" })
        expect(dto.roleOptions.map((role) => role.id)).not.toContain(adminRoleId)
    })
    it("valida prazos e limites e salva com versão otimista, sem sobrescrever em conflito", async () => {
        expect(platformSettingsSchema.safeParse({ ...DEFAULT_PLATFORM_SETTINGS, retentionDays: { ...DEFAULT_PLATFORM_SETTINGS.retentionDays, jobs: 0 } }).success).toBe(false)
        expect(platformSettingsSchema.safeParse({ ...DEFAULT_PLATFORM_SETTINGS, documents: { maxFileSizeMb: 25, allowedTypes: [] } }).success).toBe(false)
        const saved = await save(admin, { retentionDays: { ...DEFAULT_PLATFORM_SETTINGS.retentionDays, clients: 90 } })
        expect(saved.version).toBe(1)
        expect(saved.settings.retentionDays.clients).toBe(90)
        await expect(save(admin, { retentionDays: { ...DEFAULT_PLATFORM_SETTINGS.retentionDays, clients: 10 } }, 0)).rejects.toMatchObject({ code: "VERSION_CONFLICT" })
        expect((await getPlatformSettings(admin)).settings.retentionDays.clients).toBe(90)
        expect(await models.audits.countDocuments({ action: "platform.update" })).toBe(1)
    })
    it("perfil padrão: nunca o Administrador, nem inativo, nem fora da hierarquia de quem configura", async () => {
        await expect(save(admin, { defaultRoleId: adminRoleId })).rejects.toMatchObject({ status: 400, code: "DEFAULT_ROLE_INVALID" })
        const inactive = await createRole(admin, { ...roleData("Inativo"), ativo: false })
        await expect(save(admin, { defaultRoleId: inactive.id })).rejects.toMatchObject({ code: "DEFAULT_ROLE_INVALID" })
        const high = await createRole(admin, roleData("Alto", ["admin.access", "integrations.platform.view", "integrations.platform.edit"]))
        const low = await createRole(admin, roleData("Baixo"))
        const manager = await models.users.create({ name: "Gestor", email: "gestor@example.test", active: true, roles: [low.id] })
        await models.roles.updateOne({ _id: low.id }, { $set: { permissoes: ["admin.access", "integrations.platform.view", "integrations.platform.edit"] } })
        const limited = await resolveAccess(manager.id as string)
        await expect(save(limited, { defaultRoleId: high.id })).rejects.toMatchObject({ status: 403 })
        const viewer = await models.users.create({ name: "Leitor", email: "leitor@example.test", active: true, roles: [(await createRole(admin, roleData("Leitor", ["admin.access", "integrations.platform.view"]))).id] })
        await expect(save(await resolveAccess(viewer.id as string), {})).rejects.toMatchObject({ status: 403 })
        const ok = await save(admin, { defaultRoleId: low.id })
        expect(ok.settings.defaultRoleId).toBe(low.id)
    })
    it("cadastro público falha fechado sem termos publicados e abre com perfil padrão válido + termos", async () => {
        const role = await createRole(admin, roleData("Prestador"))
        await save(admin, { defaultRoleId: role.id })
        expect(await signupAvailability()).toMatchObject({ available: false, reason: "no-legal-version" })
        await publishLegalVersion(admin, legal())
        expect(await signupAvailability()).toMatchObject({ available: true, reason: null, defaultRoleId: role.id, legalVersion: 1 })
        await models.roles.updateOne({ _id: role.id }, { $set: { ativo: false } })
        expect(await signupAvailability()).toMatchObject({ available: false, reason: "default-role-invalid" })
    })
    it("rotas exigem a permissão da integração Plataforma", () => {
        expect(routePermissions("/api/platform/settings", "GET")).toEqual(["integrations.platform.view"])
        expect(routePermissions("/api/platform/settings", "PUT")).toEqual(["integrations.platform.edit"])
        expect(routePermissions("/api/platform/legal", "POST")).toEqual(["integrations.platform.edit"])
        expect(routePermissions("/api/me/legal", "GET")).toEqual([])
        expect(routePermissions("/api/me/legal/accept", "POST")).toEqual([])
    })
})

describe("termos de uso e política de privacidade versionados", () => {
    it("sem versão publicada ninguém é bloqueado; publicar bloqueia todos (inclusive quem publicou) até o aceite", async () => {
        expect(admin.legalAcceptanceRequired).toBe(false)
        expect(await publishLegalVersion(admin, legal())).toEqual({ version: 1 })
        const blocked = await resolveAccess(admin.userId, "none", null, 0)
        expect(blocked).toMatchObject({ legalAcceptanceRequired: true, legalVersion: 1 })
        await expect(publishLegalVersion(blocked, legal(" 2"))).rejects.toMatchObject({ code: "TERMS_ACCEPTANCE_REQUIRED" })
        const accepted = await acceptLegal(blocked, { version: 1 })
        expect(accepted.version).toBe(1)
        expect((await resolveAccess(admin.userId, "none", null, 0)).legalAcceptanceRequired).toBe(false)
        const stored = await models.users.findById(admin.userId).lean()
        expect(stored?.legalAcceptance?.version).toBe(1)
        expect(stored?.legalAcceptance?.acceptedAt).toBeInstanceOf(Date)
        expect(await models.audits.countDocuments({ action: "legal.accept", actorId: admin.userId })).toBe(1)
    })
    it("nova versão exige novo aceite; aceite de versão antiga ou inexistente é recusado", async () => {
        await publishLegalVersion(admin, legal())
        await acceptLegal(admin, { version: 1 })
        const current = await resolveAccess(admin.userId, "none", null, 0)
        await publishLegalVersion(current, { ...legal(" v2"), notes: "LGPD" })
        await expect(acceptLegal(current, { version: 1 })).rejects.toMatchObject({ status: 409, code: "LEGAL_VERSION_OUTDATED" })
        await expect(acceptLegal(current, { version: 3 })).rejects.toMatchObject({ code: "LEGAL_VERSION_OUTDATED" })
        const mine = await getMyLegal(admin.userId)
        expect(mine).toMatchObject({ acceptedVersion: 1, acceptanceRequired: true, current: { version: 2, termsOfUse: "# Termos v2", notes: "LGPD" } })
        const overview = await getLegalOverview()
        expect(overview.history.map((item) => item.version)).toEqual([2, 1])
        expect(overview.history[0]).toMatchObject({ publishedBy: admin.userId, publishedByName: "Admin" })
        expect(await platform.legal.findOne({ version: 1 }).lean()).toMatchObject({ termsOfUse: "# Termos" })
    })
    it("publicações simultâneas geram versões sequenciais sem duplicar", async () => {
        await platform.settings.deleteMany({})
        const results = await Promise.allSettled([publishLegalVersion(admin, legal(" a")), publishLegalVersion(admin, legal(" b"))])
        const versions = results.filter((result) => result.status === "fulfilled").map((result) => (result as PromiseFulfilledResult<{ version: number }>).value.version)
        expect(new Set(versions).size).toBe(versions.length)
        expect(await platform.legal.countDocuments()).toBe(versions.length)
        expect((await platform.settings.findById("global").lean())?.legalVersion).toBe(Math.max(...versions))
    })
    it("valida os textos e recusa quem não pode editar a plataforma", async () => {
        await expect(publishLegalVersion(admin, { termsOfUse: " ", privacyPolicy: "x" })).rejects.toMatchObject({ status: 400 })
        const role = await createRole(admin, roleData("Leitor", ["admin.access", "integrations.platform.view"]))
        const user = await models.users.create({ name: "Leitor", email: "leitor@example.test", active: true, roles: [role.id] })
        await expect(publishLegalVersion(await resolveAccess(user.id as string), legal())).rejects.toMatchObject({ status: 403 })
        expect(await platform.legal.countDocuments()).toBe(0)
    })
})
