import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server-core"

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined) }))

import { accessModels } from "@/features/access/server/models"
import { createRole, createUser } from "@/features/access/server/commands"
import { resolveAccess } from "@/features/access/server/access"
import type { AccessContext } from "@/features/access/server/context"
import { platformModels } from "@/features/platform/server/models"
import { updatePlatformSettings } from "@/features/platform/server/settings"
import { acceptLegal, publishLegalVersion } from "@/features/platform/server/legal"
import { DEFAULT_PLATFORM_SETTINGS } from "@/features/platform/schemas"
import { resolveGoogleAccount } from "@/features/auth/server/google-account"

/** Vínculo e cadastro público pelo Google contra o Mongo efêmero (nunca o banco real). */
let replica: MongoMemoryReplSet
let admin: AccessContext
const models = accessModels()
const platform = platformModels()
const google = (sub: string, email: string, extra: Partial<{ emailVerified: boolean; name: string }> = {}) => ({ sub, email, emailVerified: true, name: "Pessoa Google", ...extra })

async function enablePublicSignup() {
    const role = await createRole(admin, { nome: "Prestador", descricao: "", cor: "azul", ativo: true, permissoes: ["admin.access"] })
    await updatePlatformSettings(admin, { ...DEFAULT_PLATFORM_SETTINGS, defaultRoleId: role.id, version: 0 })
    const { version } = await publishLegalVersion(admin, { termsOfUse: "Termos", privacyPolicy: "Privacidade" })
    // Quem publica também fica bloqueado até aceitar; o admin aceita para seguir administrando.
    await acceptLegal(admin, { version })
    return role.id
}

beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.18" }, replSet: { count: 1 }, instanceOpts: [{ ip: "127.0.0.1" }] })
    await mongoose.connect(replica.getUri("ciliar_google_test"))
    await Promise.all([...Object.values(models), ...Object.values(platform)].map((model) => model.init()))
}, 120_000)
beforeEach(async () => {
    await Promise.all([...Object.values(models), ...Object.values(platform)].map((model) => model.deleteMany({})))
    const role = await models.roles.create({ slug: "admin", nome: "Administrador", permissoes: ["*"], ativo: true })
    const user = await models.users.create({ name: "Admin", email: "admin@example.test", active: true, roles: [role.id] })
    admin = await resolveAccess(user.id as string, "none", null, 0)
})
afterAll(async () => {
    await mongoose.disconnect()
    await replica?.stop()
})

describe("login Google: vínculo automático e cadastro público", () => {
    it("vincula automaticamente o usuário existente (convite/CLI/migração) com e-mail verificado e mantém perfis", async () => {
        const result = await resolveGoogleAccount(google("sub-admin", "ADMIN@example.test"))
        expect(result).toMatchObject({ status: "ok", userId: admin.userId, outcome: "linked" })
        const stored = await models.users.findById(admin.userId).select("+googleSub").lean()
        expect(stored).toMatchObject({ googleSub: "sub-admin", roles: [admin.roles[0]!.id] })
        expect(stored?.lastLoginAt).toBeInstanceOf(Date)
        expect(await models.audits.countDocuments({ action: "user.google_link", targetId: admin.userId })).toBe(1)
        expect(await resolveGoogleAccount(google("sub-admin", "admin@example.test"))).toMatchObject({ status: "ok", outcome: "existing" })
    })
    it("recusa e-mail não verificado ou ausente, sem vincular", async () => {
        expect(await resolveGoogleAccount(google("sub-x", "admin@example.test", { emailVerified: false }))).toEqual({ status: "denied", code: "nao-verificado" })
        expect(await resolveGoogleAccount({ sub: "sub-x", email: null, emailVerified: true })).toEqual({ status: "denied", code: "nao-verificado" })
        expect((await models.users.findById(admin.userId).select("+googleSub").lean())?.googleSub).toBeUndefined()
    })
    it("usuário inativo continua bloqueado, vinculado ou não", async () => {
        const role = await createRole(admin, { nome: "Leitor", descricao: "", cor: "azul", ativo: true, permissoes: ["admin.access"] })
        const invited = await createUser(admin, { nome: "Inativo", email: "inativo@example.test", ativo: false, cargos: [role.id] })
        expect(await resolveGoogleAccount(google("sub-inativo", "inativo@example.test"))).toEqual({ status: "denied", code: "inativo" })
        await models.users.updateOne({ _id: invited.id }, { $set: { active: true } })
        expect(await resolveGoogleAccount(google("sub-inativo", "inativo@example.test"))).toMatchObject({ status: "ok", outcome: "linked" })
        await models.users.updateOne({ _id: invited.id }, { $set: { active: false } })
        expect(await resolveGoogleAccount(google("sub-inativo", "inativo@example.test"))).toEqual({ status: "denied", code: "inativo" })
    })
    it("e-mail já vinculado a outra conta Google é recusado sem trocar o vínculo", async () => {
        await resolveGoogleAccount(google("sub-original", "admin@example.test"))
        expect(await resolveGoogleAccount(google("sub-intruso", "admin@example.test"))).toEqual({ status: "denied", code: "conta-vinculada" })
        expect((await models.users.findById(admin.userId).select("+googleSub").lean())?.googleSub).toBe("sub-original")
    })
    it("convite mantém os perfis escolhidos, não o perfil padrão", async () => {
        const defaultRole = await enablePublicSignup()
        const special = await createRole(admin, { nome: "Especial", descricao: "", cor: "verde", ativo: true, permissoes: ["admin.access", "users.view"] })
        const invited = await createUser(admin, { nome: "Convidada", email: "convidada@example.test", ativo: true, cargos: [special.id] })
        expect(await resolveGoogleAccount(google("sub-convidada", "convidada@example.test"))).toMatchObject({ status: "ok", userId: invited.id, outcome: "linked" })
        expect((await models.users.findById(invited.id).lean())?.roles).toEqual([special.id])
        expect(defaultRole).not.toBe(special.id)
    })
    it("cadastro público falha fechado sem perfil padrão ou sem termos publicados", async () => {
        expect(await resolveGoogleAccount(google("sub-novo", "novo@example.test"))).toEqual({ status: "denied", code: "cadastro-indisponivel" })
        const role = await createRole(admin, { nome: "Prestador", descricao: "", cor: "azul", ativo: true, permissoes: ["admin.access"] })
        await updatePlatformSettings(admin, { ...DEFAULT_PLATFORM_SETTINGS, defaultRoleId: role.id, version: 0 })
        expect(await resolveGoogleAccount(google("sub-novo", "novo@example.test"))).toEqual({ status: "denied", code: "cadastro-indisponivel" })
        expect(await models.users.exists({ email: "novo@example.test" })).toBeNull()
    })
    it("cadastro público cria a conta com o perfil padrão, auditoria e exige o aceite dos termos", async () => {
        const defaultRole = await enablePublicSignup()
        const result = await resolveGoogleAccount(google("sub-novo", "Novo@Example.test", { name: "Nova Prestadora" }))
        expect(result).toMatchObject({ status: "ok", outcome: "signup" })
        const userId = (result as { userId: string }).userId
        const stored = await models.users.findById(userId).select("+googleSub").lean()
        expect(stored).toMatchObject({ name: "Nova Prestadora", email: "novo@example.test", roles: [defaultRole], googleSub: "sub-novo", signupSource: "public", active: true })
        expect(await models.audits.findOne({ action: "user.signup", targetId: userId }).lean()).toMatchObject({ actorId: "google-signup" })
        expect((await resolveAccess(userId, "none", null, 0)).legalAcceptanceRequired).toBe(true)
    })
    it("dois primeiros acessos simultâneos criam uma única conta", async () => {
        await enablePublicSignup()
        const results = await Promise.all([resolveGoogleAccount(google("sub-dup", "dup@example.test")), resolveGoogleAccount(google("sub-dup", "dup@example.test"))])
        expect(results.every((result) => result.status === "ok")).toBe(true)
        expect(await models.users.countDocuments({ email: "dup@example.test" })).toBe(1)
        expect(await models.audits.countDocuments({ action: "user.signup" })).toBe(1)
    })
})
