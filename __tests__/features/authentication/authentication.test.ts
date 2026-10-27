import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server-core"

vi.unmock("@/features/authentication/server/state")
vi.mock("@/lib/db", async (original) => ({ ...(await original<object>()), dbConnect: vi.fn(async () => undefined) }))
vi.mock("ai", () => ({ dynamicTool: (def: unknown) => def }))

import { accessModels } from "@/features/access/server/models"
import { createRole, createUser } from "@/features/access/server/commands"
import { resolveAccess, userRows } from "@/features/access/server/access"
import { requestAccess, type AccessContext } from "@/features/access/server/context"
import { changeOwnPassword, removeUserPassword, setUserPassword } from "@/features/access/server/passwords"
import { createOperatorUser, OPERATOR_ADMIN } from "@/features/access/server/operator"
import { platformModels } from "@/features/platform/server/models"
import { updatePlatformSettings } from "@/features/platform/server/settings"
import { acceptLegal, publishLegalVersion } from "@/features/platform/server/legal"
import { DEFAULT_PLATFORM_SETTINGS } from "@/features/platform/schemas"
import { authSettingsModels } from "@/features/authentication/server/models"
import { cachedAuthSettings, invalidateAuthSettingsCache } from "@/features/authentication/server/state"
import { getAuthSettings, updateAuthSettings } from "@/features/authentication/server/settings"
import { assertMutationOrigin, requestAuthContext } from "@/features/auth/server/origin"
import { verifyPassword } from "@/features/auth/server/password"
import { signupWithPassword } from "@/features/auth/server/password-signup"
import { resolveGoogleAccount } from "@/features/auth/server/google-account"
import { findOpexTool } from "@/features/opex-agent/server/tools/registry"

/** Integração Autenticação, senhas e cadastro por senha contra o Mongo efêmero (nunca o banco real). */
let replica: MongoMemoryReplSet
let admin: AccessContext
const models = accessModels()
const platform = platformModels()
const auth = authSettingsModels()
const all = () => [...Object.values(models), ...Object.values(platform), ...Object.values(auth)]
const PASSWORD = "senha-muito-segura"
const roleData = (nome: string, permissoes: string[]) => ({ nome, descricao: "", cor: "azul" as const, ativo: true, permissoes })
const passwordHashOf = async (id: string) => (await models.users.findById(id).select("+passwordHash").lean())?.passwordHash ?? null
const sessionVersionOf = async (id: string) => (await models.users.findById(id).lean())!.sessionVersion

async function run(name: string, raw: unknown, access: AccessContext) {
    const tool = findOpexTool(name)!
    const input = tool.input.parse(raw)
    tool.authorize?.(input, access)
    const scope = { userId: access.userId, viewAsHeader: access.viewAsHeader, sessionVersion: access.sessionVersion }
    return requestAccess.run(access, () => tool.execute(input, { sessionId: "s".repeat(24), actorId: access.userId, scope, access })) as Promise<Record<string, unknown>>
}

async function enablePublicSignup() {
    const role = await createRole(admin, roleData("Prestador", ["admin.access"]))
    await updatePlatformSettings(admin, { ...DEFAULT_PLATFORM_SETTINGS, defaultRoleId: role.id, version: 0 })
    const { version } = await publishLegalVersion(admin, { termsOfUse: "Termos", privacyPolicy: "Privacidade" })
    await acceptLegal(admin, { version })
    admin = await resolveAccess(admin.userId, "none", null, admin.sessionVersion)
    return role.id
}

beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.18" }, replSet: { count: 1 }, instanceOpts: [{ ip: "127.0.0.1" }] })
    await mongoose.connect(replica.getUri("ciliar_authentication_test"))
    await Promise.all(all().map((model) => model.init()))
}, 120_000)
beforeEach(async () => {
    vi.stubEnv("APP_ORIGIN", "https://ciliar.example")
    await Promise.all(all().map((model) => model.deleteMany({})))
    invalidateAuthSettingsCache()
    const role = await models.roles.create({ slug: "admin", nome: "Administrador", permissoes: ["*"], ativo: true })
    const user = await models.users.create({ name: "Admin", email: "admin@example.test", active: true, roles: [role.id] })
    admin = await resolveAccess(user.id as string, "none", null, 0)
})
afterAll(async () => {
    vi.unstubAllEnvs()
    await mongoose.disconnect()
    await replica?.stop()
})

describe("integração Autenticação: métodos por protocolo e endereços", () => {
    it("antes de salvar vale só Google nos dois protocolos e só o host oficial", async () => {
        const dto = await getAuthSettings(admin)
        expect(dto).toMatchObject({ settings: { methods: { http: ["google"], https: ["google"] }, extraHosts: [] }, version: 0, canonicalHost: "ciliar.example", current: null })
        expect(await cachedAuthSettings()).toEqual(dto.settings)
    })
    it("salva HTTP e HTTPS independentes, audita, persiste e invalida o cache do login", async () => {
        const http = new Headers({ host: "217.77.3.47:4003", "x-forwarded-proto": "http" })
        expect(await requestAuthContext(http)).toMatchObject({ resolved: { allowed: false }, methods: [] })
        const saved = await updateAuthSettings(admin, { methods: { http: ["password"], https: ["google", "password"] }, extraHosts: ["217.77.3.47"], version: 0 }, { headers: http, url: "http://0.0.0.0/" })
        expect(saved).toMatchObject({ version: 1, settings: { methods: { http: ["password"], https: ["google", "password"] }, extraHosts: ["217.77.3.47"] }, current: { protocol: "http", host: "217.77.3.47:4003", allowed: true, methods: ["password"] } })
        expect(await requestAuthContext(http)).toMatchObject({ resolved: { origin: "http://217.77.3.47:4003", allowed: true }, methods: ["password"] })
        expect(await requestAuthContext(new Headers({ host: "ciliar.example", "x-forwarded-proto": "https" }))).toMatchObject({ methods: ["google", "password"] })
        // Mutação vinda do IP liberado (qualquer porta) passa; outro host não.
        const post = (origin: string, host: string) => new Request(`http://0.0.0.0/api/users`, { method: "POST", headers: { origin, host, "x-forwarded-proto": "http", "x-ciliar-request": "1" } })
        await expect(assertMutationOrigin(post("http://217.77.3.47:8080", "217.77.3.47:8080"))).resolves.toBeUndefined()
        await expect(assertMutationOrigin(post("http://217.77.3.48:8080", "217.77.3.48:8080"))).rejects.toMatchObject({ code: "INVALID_ORIGIN" })
        await expect(assertMutationOrigin(post("http://217.77.3.47:8080", "217.77.3.47:9090"))).rejects.toMatchObject({ code: "INVALID_ORIGIN" })
        // Persistência (recarregar/reiniciar = nova leitura do banco).
        invalidateAuthSettingsCache()
        expect((await getAuthSettings(admin)).settings).toEqual(saved.settings)
        const audit = await models.audits.findOne({ action: "auth_settings.update" }).lean()
        expect(audit).toMatchObject({ actorId: admin.userId, targetId: "authentication", before: { methods: { http: ["google"], https: ["google"] } } })
    })
    it("recusa protocolo sem método, host inválido, versão antiga e quem não pode editar", async () => {
        await expect(updateAuthSettings(admin, { methods: { http: [], https: ["google"] }, extraHosts: [], version: 0 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
        await expect(updateAuthSettings(admin, { methods: { http: ["google"], https: ["google"] }, extraHosts: ["http://1.2.3.4:80"], version: 0 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
        await updateAuthSettings(admin, { methods: { http: ["password"], https: ["google"] }, extraHosts: [], version: 0 })
        await expect(updateAuthSettings(admin, { methods: { http: ["google"], https: ["google"] }, extraHosts: [], version: 0 })).rejects.toMatchObject({ code: "VERSION_CONFLICT" })
        expect((await getAuthSettings(admin)).settings.methods.http).toEqual(["password"])
        const viewerRole = await createRole(admin, roleData("Leitor", ["admin.access", "integrations.authentication.view"]))
        const viewer = await models.users.create({ name: "Leitor", email: "leitor@example.test", active: true, roles: [viewerRole.id] })
        const access = await resolveAccess(viewer.id as string, "none", null, 0)
        await expect(updateAuthSettings(access, { methods: { http: ["google"], https: ["google"] }, extraHosts: [], version: 1 })).rejects.toMatchObject({ status: 403 })
    })
    it("ferramentas do agente leem e alteram só o informado", async () => {
        expect(await run("get_auth_settings", {}, admin)).toMatchObject({ methods: { http: ["google"], https: ["google"] }, officialHost: "ciliar.example", extraHosts: [] })
        expect(await run("update_auth_settings", { http: ["password", "google"] }, admin)).toMatchObject({ ok: true, methods: { http: ["google", "password"], https: ["google"] } })
        expect(await run("update_auth_settings", { extraHosts: ["217.77.3.47"] }, admin)).toMatchObject({ methods: { http: ["google", "password"] }, extraHosts: ["217.77.3.47"] })
        await expect(run("update_auth_settings", {}, admin)).rejects.toThrow(/Nada para alterar/)
        expect(() => findOpexTool("update_auth_settings")!.input.parse({ https: [] })).toThrow()
    })
})

describe("senhas: administrador, própria conta, CLI e cadastro público", () => {
    it("convite com senha inicial guarda só o hash e a conta entra pela senha", async () => {
        const role = await createRole(admin, roleData("Leitor", ["admin.access"]))
        const { id } = await createUser(admin, { nome: "Ana", email: "ana@example.test", ativo: true, cargos: [role.id], password: PASSWORD })
        const hash = await passwordHashOf(id)
        expect(hash).toMatch(/^\$argon2id\$/)
        expect(await verifyPassword(hash!, PASSWORD)).toBe(true)
        const dto = (await userRows(admin)).find((row) => row.id === id)!
        expect(dto).toMatchObject({ convitePendente: false, metodos: { google: false, senha: true } })
        expect(JSON.stringify(dto)).not.toMatch(/argon|passwordHash/)
        expect(await models.audits.findOne({ action: "user.create", targetId: id }).lean()).toMatchObject({ after: { senha: true } })
    })
    it("admin define e remove a senha de outro usuário, encerrando as sessões, sem mexer na própria", async () => {
        const role = await createRole(admin, roleData("Leitor", ["admin.access"]))
        const { id } = await createUser(admin, { nome: "Bia", email: "bia@example.test", ativo: true, cargos: [role.id] })
        await setUserPassword(admin, id, { password: PASSWORD })
        expect(await verifyPassword((await passwordHashOf(id))!, PASSWORD)).toBe(true)
        expect(await sessionVersionOf(id)).toBe(1)
        await expect(setUserPassword(admin, id, { password: "curta" })).rejects.toMatchObject({ status: 400 })
        await expect(setUserPassword(admin, admin.userId, { password: PASSWORD })).rejects.toMatchObject({ status: 403 })
        expect(await removeUserPassword(admin, id)).toEqual({ id, senha: false, google: false })
        expect(await passwordHashOf(id)).toBeNull()
        expect(await sessionVersionOf(id)).toBe(2)
        await expect(removeUserPassword(admin, id)).rejects.toMatchObject({ code: "PASSWORD_NOT_SET" })
        expect(await models.audits.countDocuments({ action: { $in: ["user.password_set", "user.password_removed"] }, targetId: id })).toBe(2)
        const audits = await models.audits.find({ targetId: id }).lean()
        expect(JSON.stringify(audits)).not.toContain(PASSWORD)
    })
    it("senha fora da hierarquia é recusada", async () => {
        const high = await createRole(admin, roleData("Alto", ["admin.access", "users.view", "users.edit"]))
        const low = await createRole(admin, roleData("Baixo", ["admin.access"]))
        const actor = await models.users.create({ name: "Gestor", email: "gestor@example.test", active: true, roles: [low.id] })
        const target = await models.users.create({ name: "Chefe", email: "chefe@example.test", active: true, roles: [high.id] })
        await models.roles.updateOne({ _id: low.id }, { $set: { permissoes: ["admin.access", "users.view", "users.edit"] } })
        const access = await resolveAccess(actor.id as string, "none", null, 0)
        await expect(setUserPassword(access, target.id as string, { password: PASSWORD })).rejects.toMatchObject({ status: 403 })
    })
    it("própria conta cria a senha (só Google) e depois troca exigindo a atual; sessões encerradas", async () => {
        await changeOwnPassword(admin, { newPassword: PASSWORD })
        expect(await verifyPassword((await passwordHashOf(admin.userId))!, PASSWORD)).toBe(true)
        expect(await sessionVersionOf(admin.userId)).toBe(1)
        admin = await resolveAccess(admin.userId, "none", null, 1)
        await expect(changeOwnPassword(admin, { newPassword: "outra-senha-segura" })).rejects.toMatchObject({ code: "INVALID_PASSWORD" })
        await expect(changeOwnPassword(admin, { currentPassword: "errada", newPassword: "outra-senha-segura" })).rejects.toMatchObject({ code: "INVALID_PASSWORD" })
        await expect(changeOwnPassword(admin, { currentPassword: PASSWORD, newPassword: PASSWORD })).rejects.toMatchObject({ status: 400 })
        await changeOwnPassword(admin, { currentPassword: PASSWORD, newPassword: "outra-senha-segura" })
        expect(await verifyPassword((await passwordHashOf(admin.userId))!, "outra-senha-segura")).toBe(true)
        expect(await models.audits.countDocuments({ action: { $in: ["user.password_created", "user.password_changed"] }, actorId: admin.userId })).toBe(2)
    })
    it("CLI cadastra o administrador com senha opcional", async () => {
        await Promise.all(Object.values(models).map((model) => model.deleteMany({})))
        const { id } = await createOperatorUser(mongoose.connection, { nome: "Operador", email: "op@example.test" }, [OPERATOR_ADMIN], PASSWORD)
        expect(await verifyPassword((await passwordHashOf(id))!, PASSWORD)).toBe(true)
        await expect(createOperatorUser(mongoose.connection, { nome: "Outro", email: "outro@example.test" }, [OPERATOR_ADMIN], "curta")).rejects.toThrow()
    })
    it("cadastro público por senha segue as regras do cadastro Google (falha fechado)", async () => {
        const input = { nome: "Pessoa Nova", email: "NOVA@example.test", password: PASSWORD }
        await expect(signupWithPassword(input)).rejects.toMatchObject({ code: "SIGNUP_UNAVAILABLE" })
        const roleId = await enablePublicSignup()
        const created = await signupWithPassword(input)
        const stored = await models.users.findById(created.id).select("+passwordHash").lean().orFail()
        expect(stored).toMatchObject({ email: "nova@example.test", roles: [roleId], signupSource: "public", passwordUnverified: true })
        expect(await verifyPassword(stored.passwordHash!, PASSWORD)).toBe(true)
        expect(await models.audits.findOne({ action: "user.signup", targetId: created.id }).lean()).toMatchObject({ actorId: "password-signup" })
        expect((await resolveAccess(created.id)).legalAcceptanceRequired).toBe(true)
        await expect(signupWithPassword(input)).rejects.toMatchObject({ code: "SIGNUP_EMAIL_TAKEN" })
        await expect(signupWithPassword({ ...input, email: "x@example.test", password: "curta" })).rejects.toMatchObject({ status: 400 })
    })
    it("vínculo Google pelo e-mail verificado descarta a senha não verificada do cadastro público", async () => {
        await enablePublicSignup()
        const created = await signupWithPassword({ nome: "Impostor", email: "dono@example.test", password: PASSWORD })
        const result = await resolveGoogleAccount({ sub: "sub-dono", email: "dono@example.test", emailVerified: true, name: "Dono" })
        expect(result).toMatchObject({ status: "ok", outcome: "linked", sessionVersion: 1 })
        expect(await passwordHashOf(created.id)).toBeNull()
        expect(await models.audits.countDocuments({ action: "user.unverified_password_dropped", targetId: created.id })).toBe(1)
        // Senha definida pelo administrador (verificada) não é descartada no vínculo.
        const role = await createRole(admin, roleData("Leitor", ["admin.access"]))
        const { id } = await createUser(admin, { nome: "Caio", email: "caio@example.test", ativo: true, cargos: [role.id], password: PASSWORD })
        await resolveGoogleAccount({ sub: "sub-caio", email: "caio@example.test", emailVerified: true })
        expect(await passwordHashOf(id)).not.toBeNull()
    })
    it("ferramentas do agente definem e removem a senha sem devolvê-la nem exibi-la", async () => {
        const role = await createRole(admin, roleData("Leitor", ["admin.access"]))
        await createUser(admin, { nome: "Duda", email: "duda@example.test", ativo: true, cargos: [role.id] })
        const tool = findOpexTool("set_user_password")!
        const input = tool.input.parse({ user: "duda@example.test", password: PASSWORD })
        expect(JSON.stringify(tool.redact!(input))).not.toContain(PASSWORD)
        expect(tool.summarize!(input)).not.toContain(PASSWORD)
        const result = await run("set_user_password", { user: "duda@example.test", password: PASSWORD }, admin)
        expect(result).toMatchObject({ ok: true, passwordSet: true })
        expect(JSON.stringify(result)).not.toMatch(new RegExp(`${PASSWORD}|argon`))
        expect(await run("get_user", { user: "duda@example.test" }, admin)).toMatchObject({ loginMethods: { google: false, password: true } })
        expect(await run("remove_user_password", { user: "duda@example.test" }, admin)).toMatchObject({ ok: true, passwordSet: false, googleLinked: false })
        expect(() => tool.input.parse({ user: "duda@example.test", password: "curta" })).toThrow()
    })
})
