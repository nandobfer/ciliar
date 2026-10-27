import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { encodeViewAs } from "@nandobfer/perfix"
import { MongoMemoryReplSet } from "mongodb-memory-server-core"
import { accessModels } from "@/features/access/server/models"
import { createOperatorUser, OPERATOR_ADMIN } from "@/features/access/server/operator"
import { createUser, updateUser, deleteUser, createRole, updateRole, deleteRole, reorderRoles } from "@/features/access/server/commands"
import { assertTransactionTopology, resolveAccess, userRows, roleRows } from "@/features/access/server/access"
import type { AccessContext } from "@/features/access/server/context"
import { platformModels } from "@/features/platform/server/models"
import { updatePlatformSettings } from "@/features/platform/server/settings"
import { DEFAULT_PLATFORM_SETTINGS } from "@/features/platform/schemas"

vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(async () => undefined) }))
const mail = vi.hoisted(() => ({ isMockMode: vi.fn(async () => true), sendEmail: vi.fn(async () => undefined) }))
vi.mock("@/lib/email/mailer", () => mail)
let replica: MongoMemoryReplSet
let context: AccessContext
let actorId: string
const models = accessModels()
const platform = platformModels()
const newUser = (email: string, cargos: string[], extra: Record<string, unknown> = {}) => ({ nome: "Pessoa", email, ativo: true, cargos, ...extra })
const roleData = (nome: string, permissoes = ["admin.access", "integrations.smtp.view"]) => ({ nome, descricao: "Teste", cor: "roxo", ativo: true, permissoes })
const viewAs = (tipo: "cargo" | "usuario", id: string) => encodeViewAs(tipo === "cargo" ? { tipo, roleId: id } : { tipo, userId: id })

beforeAll(async () => {
    // Banco efêmero próprio; nunca usa MONGODB_URI nem Docker/Mongo compartilhado.
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.18" }, replSet: { count: 1 }, instanceOpts: [{ ip: "127.0.0.1" }] })
    await mongoose.connect(replica.getUri("ciliar_access_test"))
    await Promise.all([...Object.values(models), ...Object.values(platform)].map(model => model.init()))
}, 120_000)
beforeEach(async () => {
    vi.clearAllMocks(); mail.isMockMode.mockResolvedValue(true)
    await Promise.all([...Object.values(models), ...Object.values(platform)].map(model => model.deleteMany({})))
    const admin = await models.roles.create({ slug: "admin", nome: "Administrador", permissoes: ["*"], ativo: true })
    const actor = await models.users.create({ name: "Administrador", email: "admin@example.test", active: true, roles: [admin.id] })
    actorId = actor.id as string
    context = await resolveAccess(actorId, "none", null, 0)
})
afterAll(async () => { await mongoose.disconnect(); await replica?.stop() })

describe("persistência transacional de usuários e perfis", () => {
    it("preserva atribuição inativa existente sem permitir atribuí-la a novas contas", async () => {
        const role = await createRole(context, roleData("Leitor"))
        const user = await createUser(context, newUser("inactive-role@example.test", [role.id]))
        await updateRole(context, role.id, { version: 0, ativo: false })
        await updateUser(context, user.id, { nome: "Nome ajustado", ativo: true, cargos: [role.id], version: 0 })
        expect((await models.users.findById(user.id))?.roles).toEqual([role.id])
        await expect(createUser(context, newUser("new-inactive-role@example.test", [role.id]))).rejects.toMatchObject({ status: 400 })
    })
    it("pré-cadastra (convite) sem senha, com convite pendente e e-mail normalizado", async () => {
        const role = await createRole(context, roleData("Leitor"))
        const result = await createUser(context, newUser("  USUARIO@EXAMPLE.TEST ", [role.id]))
        expect(result.convite).toBe("nao-solicitado")
        const user = await models.users.findById(result.id).select("+googleSub").lean().orFail()
        expect(user.email).toBe("usuario@example.test")
        expect(user).not.toHaveProperty("passwordHash")
        expect(user.googleSub).toBeUndefined()
        expect(user.signupSource).toBe("invite")
        const dto = (await userRows(context)).find(row => row.id === result.id)!
        expect(dto).toMatchObject({ convitePendente: true, metodos: { google: false, senha: false }, ultimoAcesso: null, termosAceitos: null })
        expect(JSON.stringify(dto)).not.toMatch(/googleSub|password/)
        await expect(createUser(context, { ...newUser("curta@example.test", [role.id]), password: "curta" })).rejects.toMatchObject({ status: 400 })
    })
    it("envia o convite por e-mail só com SMTP configurado e nunca desfaz o cadastro por falha no envio", async () => {
        const role = await createRole(context, roleData("Leitor"))
        expect((await createUser(context, newUser("sem-smtp@example.test", [role.id], { enviarConvite: true }))).convite).toBe("smtp-indisponivel")
        expect(mail.sendEmail).not.toHaveBeenCalled()
        mail.isMockMode.mockResolvedValue(false)
        expect((await createUser(context, newUser("convite@example.test", [role.id], { enviarConvite: true }))).convite).toBe("enviado")
        expect(mail.sendEmail).toHaveBeenCalledWith("convite@example.test", "Convite para o Ciliar", expect.stringContaining("Entrar com Google"))
        mail.sendEmail.mockRejectedValueOnce(new Error("smtp fora"))
        const failed = await createUser(context, newUser("falha@example.test", [role.id], { enviarConvite: true }))
        expect(failed.convite).toBe("falhou")
        expect(await models.users.exists({ email: "falha@example.test" })).toBeTruthy()
    })
    it("índice único mantém somente um cadastro quando o mesmo e-mail é enviado simultaneamente", async () => {
        const role = await createRole(context, roleData("Leitor"))
        const results = await Promise.allSettled([createUser(context, newUser("dup@example.test", [role.id])), createUser(context, newUser("DUP@example.test", [role.id]))])
        expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
        expect(await models.users.countDocuments({ email: "dup@example.test" })).toBe(1)
        expect(await models.audits.countDocuments({ action: "user.create" })).toBe(1)
    })
    it("impede autoexclusão, autodesativação e troca dos próprios perfis", async () => {
        const role = await createRole(context, roleData("Leitor"))
        await expect(deleteUser(context, actorId, 0)).rejects.toMatchObject({ status: 403 })
        await expect(updateUser(context, actorId, { nome: "Admin", ativo: false, cargos: [context.roles[0]!.id], version: 0 })).rejects.toMatchObject({ status: 403 })
        await expect(updateUser(context, actorId, { nome: "Admin", ativo: true, cargos: [role.id], version: 0 })).rejects.toMatchObject({ status: 403 })
        expect((await models.users.findById(actorId))?.active).toBe(true)
    })
    it("serializa exclusões concorrentes e preserva um administrador ativo", async () => {
        const other = await models.users.create({ name: "Outro Admin", email: "other@example.test", active: true, roles: [context.roles[0]!.id] })
        const otherAccess = await resolveAccess(other.id as string)
        const result = await Promise.allSettled([deleteUser(context, other.id as string, 0), deleteUser(otherAccess, actorId, 0)])
        expect(result.filter(row => row.status === "fulfilled")).toHaveLength(1)
        expect(await models.users.countDocuments({ active: true, roles: context.roles[0]!.id })).toBe(1)
    })
    it("detecta versão obsoleta sem sobrescrever alterações", async () => {
        const role = await createRole(context, roleData("Leitor"))
        const user = await createUser(context, newUser("user@example.test", [role.id]))
        await updateUser(context, user.id, { nome: "Novo nome", ativo: true, cargos: [role.id], version: 0 })
        await expect(updateUser(context, user.id, { nome: "Nome antigo", ativo: true, cargos: [role.id], version: 0 })).rejects.toMatchObject({ code: "VERSION_CONFLICT" })
        expect((await models.users.findById(user.id))?.name).toBe("Novo nome")
    })
    it("inativa conta e revoga a versão da sessão", async () => {
        const role = await createRole(context, roleData("Leitor"))
        const user = await createUser(context, newUser("user@example.test", [role.id]))
        await updateUser(context, user.id, { nome: "Pessoa", ativo: false, cargos: [role.id], version: 0 })
        expect((await models.users.findById(user.id))?.sessionVersion).toBe(1)
        await expect(resolveAccess(user.id, "none", null, 0)).rejects.toMatchObject({ status: 401 })
    })
    it("não permite excluir Administrador, alterar wildcard ou desativá-lo", async () => {
        const id = context.roles[0]!.id
        await expect(deleteRole(context, id, 0)).rejects.toMatchObject({ status: 403 })
        await expect(updateRole(context, id, { version: 0, ativo: false })).rejects.toMatchObject({ status: 403 })
        await expect(updateRole(context, id, { version: 0, permissoes: [] })).rejects.toMatchObject({ status: 403 })
        await updateRole(context, id, { version: 0, nome: "Administradores" })
        expect((await models.roles.findById(id))?.slug).toBe("admin")
    })
    it("normaliza dependências, rejeita concessões sensíveis e aplica hierarquia", async () => {
        const manager = await createRole(context, roleData("Gestor", ["admin.access", "users.create", "users.view", "users.edit", "roles.edit"]))
        const low = await createRole(context, roleData("Inferior", ["integrations.smtp.test"]))
        expect((await models.roles.findById(low.id))?.permissoes).toContain("integrations.smtp.view")
        const user = await models.users.create({ name: "Gestor", email: "gestor@example.test", roles: [manager.id], active: true })
        const restricted = await resolveAccess(user.id as string)
        await expect(createUser(restricted, newUser("escalada@example.test", [context.roles[0]!.id]))).rejects.toMatchObject({ status: 403 })
        await expect(createRole(restricted, roleData("Novo"))).rejects.toMatchObject({ status: 403 })
        expect(await models.users.exists({ email: "escalada@example.test" })).toBeNull()
    })
    it("salva membros e perfil atomicamente e desfaz tudo em caso de falha", async () => {
        const role = await createRole(context, roleData("Leitor"))
        const user = await createUser(context, newUser("user@example.test", [role.id]))
        await expect(updateRole(context, role.id, { version: 0, nome: "Não deve salvar", membros: [user.id, actorId] })).rejects.toMatchObject({ status: 403 })
        expect((await models.roles.findById(role.id))?.nome).toBe("Leitor")
        expect((await models.roles.findById(role.id))?.version).toBe(0)
        await expect(deleteRole(context, role.id, 0)).rejects.toMatchObject({ status: 409 })
    })
    it("o perfil padrão do cadastro público não pode ser inativado nem excluído", async () => {
        const role = await createRole(context, roleData("Prestador"))
        await updatePlatformSettings(context, { ...DEFAULT_PLATFORM_SETTINGS, defaultRoleId: role.id, version: 0 })
        await expect(updateRole(context, role.id, { version: 0, ativo: false })).rejects.toMatchObject({ status: 409, code: "DEFAULT_ROLE_IN_USE" })
        await expect(deleteRole(context, role.id, 0)).rejects.toMatchObject({ status: 409, code: "DEFAULT_ROLE_IN_USE" })
        await updateRole(context, role.id, { version: 0, nome: "Prestadores" })
        expect((await models.roles.findById(role.id))?.ativo).toBe(true)
    })
    it("ordena hierarquia, mantém Administrador no topo e rejeita versão antiga", async () => {
        const one = await createRole(context, roleData("Um")); const two = await createRole(context, roleData("Dois"))
        const version = (await models.states.findById("global"))!.version
        await reorderRoles(context, { ordem: [two.id, one.id], version })
        expect((await roleRows()).map(row => row.id)).toEqual([context.roles[0]!.id, two.id, one.id])
        await expect(reorderRoles(context, { ordem: [one.id, two.id], version })).rejects.toMatchObject({ code: "VERSION_CONFLICT" })
    })
    it("não executa transações em topologia standalone", async () => {
        const connection = { db: { command: async () => ({ ok: 1 }) } } as unknown as mongoose.Connection
        await expect(assertTransactionTopology(connection)).rejects.toMatchObject({ code: "REPLICA_SET_REQUIRED" })
    })
})
describe("Visualizar como", () => {
    it("audita ações simuladas com o ator real e o marcador resolvido", async () => {
        const manager = await createRole(context, roleData("Cadastrador", ["admin.access", "users.create", "users.view"]))
        const viewer = await createRole(context, roleData("Leitor"))
        const simulated = await resolveAccess(actorId, viewAs("cargo", manager.id))
        const result = await createUser(simulated, newUser("simulado@example.test", [viewer.id]))
        const audit = await models.audits.findOne({ action: "user.create", targetId: result.id }).lean()
        expect(audit?.actorId).toBe(actorId)
        expect(audit?.simulation).toMatchObject({ tipo: "cargo", alvoId: manager.id })
    })
    it("limita as permissões, preserva ator real e mantém requisições/abas isoladas", async () => {
        const role = await createRole(context, roleData("Leitor"))
        const simulated = await resolveAccess(actorId, viewAs("cargo", role.id))
        expect(simulated.userId).toBe(actorId)
        expect(simulated.effective.has("*")).toBe(false)
        expect(simulated.effective.has("integrations.smtp.view")).toBe(true)
        expect(simulated.dto.realIsAdministrator).toBe(true)
        const [realTab, simulatedTab] = await Promise.all([resolveAccess(actorId, "none"), resolveAccess(actorId, viewAs("cargo", role.id))])
        expect(realTab.effective.has("*")).toBe(true); expect(simulatedTab.effective.has("*")).toBe(false)
        await expect(createRole(simulated, roleData("Proibido"))).rejects.toMatchObject({ status: 403 })
    })
    it("rejeita alvo desativado, marcador inválido e simulador não administrador", async () => {
        const role = await createRole(context, roleData("Leitor"))
        const user = await models.users.create({ name: "Leitor", email: "leitor@example.test", roles: [role.id] })
        await expect(resolveAccess(user.id as string, viewAs("cargo", role.id))).rejects.toMatchObject({ code: "VIEW_AS_FORBIDDEN" })
        await expect(resolveAccess(actorId, "{inválido")).rejects.toMatchObject({ code: "VIEW_AS_INVALID" })
        await models.users.updateOne({ _id: user._id }, { $set: { active: false } })
        await expect(resolveAccess(actorId, viewAs("usuario", user.id as string))).rejects.toMatchObject({ code: "VIEW_AS_INVALID" })
        await models.roles.updateOne({ _id: role.id }, { $set: { ativo: false } })
        await expect(resolveAccess(actorId, viewAs("cargo", role.id))).rejects.toMatchObject({ code: "VIEW_AS_INVALID" })
    })
    it("revalida perda de autorização e versão revogada da sessão", async () => {
        const role = await createRole(context, roleData("Leitor"))
        await models.users.updateOne({ _id: actorId }, { $set: { roles: [role.id] } })
        await expect(resolveAccess(actorId, viewAs("cargo", role.id))).rejects.toMatchObject({ code: "VIEW_AS_FORBIDDEN" })
        await expect(createUser(context, newUser("negado@example.test", [role.id]))).rejects.toMatchObject({ status: 403 })
        await models.users.updateOne({ _id: actorId }, { $inc: { sessionVersion: 1 } })
        await expect(resolveAccess(actorId, "none", null, 0)).rejects.toMatchObject({ status: 401 })
    })
})
describe("cadastro operacional", () => {
    it("pré-autoriza um e-mail Google como Administrador pelo CLI, sem senha", async () => {
        await Promise.all(Object.values(models).map(model => model.deleteMany({})))
        const result = await createOperatorUser(mongoose.connection, { nome: "Operador", email: "operador@example.test" }, [OPERATOR_ADMIN])
        const user = await models.users.findById(result.id).lean().orFail()
        expect(user.signupSource).toBe("cli")
        expect(user).not.toHaveProperty("passwordHash")
        expect((await resolveAccess(result.id)).effective.has("*")).toBe(true)
        const audit = await models.audits.findOne({ action: "user.create" }).lean()
        expect(audit?.actorId).toBe("operator-cli")
        await expect(createOperatorUser(mongoose.connection, { nome: "Duplicado", email: "OPERADOR@example.test" }, [OPERATOR_ADMIN])).rejects.toMatchObject({ status: 409 })
        expect((await models.users.findById(result.id))?.name).toBe("Operador")
    })
})
