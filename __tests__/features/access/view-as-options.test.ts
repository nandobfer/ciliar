import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { accessFixture } from "../../helpers/access-context"

const mocks = vi.hoisted(() => ({ auth: vi.fn(), resolveAccess: vi.fn(), roleRows: vi.fn(), find: vi.fn(), sort: vi.fn(), limit: vi.fn(), select: vi.fn() }))
vi.mock("@/auth", () => ({ auth: mocks.auth }))
vi.mock("@/features/access/server/access", async original => ({ ...await original<object>(), resolveAccess: mocks.resolveAccess, roleRows: mocks.roleRows }))
vi.mock("@/features/access/server/models", () => ({ accessModels: () => ({ users: { find: mocks.find } }) }))
import { GET } from "@/app/api/access/view-as/route"

beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv("APP_ORIGIN", "https://ciliar.example")
    mocks.auth.mockResolvedValue({ user: { id: "a".repeat(24), sessionVersion: 0 } })
    mocks.resolveAccess.mockResolvedValue(accessFixture())
    mocks.roleRows.mockResolvedValue([{ id: "admin", nome: "Administrador", cor: "roxo", ativo: true, permissoes: ["*"] }, { id: "reader", nome: "Leitor", cor: "azul", ativo: true, permissoes: [] }, { id: "old", nome: "Inativo", cor: "cinza", ativo: false, permissoes: [] }])
    mocks.find.mockReturnValue({ sort: mocks.sort }); mocks.sort.mockReturnValue({ limit: mocks.limit }); mocks.limit.mockReturnValue({ select: mocks.select })
    mocks.select.mockResolvedValue([{ id: "maria", name: "Maria", email: "maria@example.test", roles: ["reader", "old"] }])
})
afterEach(() => vi.unstubAllEnvs())
const request = (query: string) => new NextRequest(`https://ciliar.example/api/access/view-as${query}`)
describe("opções do seletor original do Shekinah", () => {
    it("inclui acesso real e cores dos perfis, sem consultar usuários na primeira etapa", async () => {
        const response = await GET(request("?kind=roles"))
        expect(response.status).toBe(200)
        expect((await response.json()).data).toEqual({ roles: [{ id: "admin", nome: "Administrador", cor: "roxo", coringa: true }, { id: "reader", nome: "Leitor", cor: "azul", coringa: false }], users: [] })
        expect(mocks.find).not.toHaveBeenCalled()
    })
    it("busca literal no servidor, pagina 20 e devolve e-mail/perfis ativos sem segredos", async () => {
        const response = await GET(request("?kind=users&q=Maria.%2B"))
        expect(response.status).toBe(200)
        expect(mocks.find).toHaveBeenCalledWith({ active: true, $or: [{ name: { $regex: "Maria\\.\\+", $options: "i" } }, { email: { $regex: "Maria\\.\\+", $options: "i" } }] })
        expect(mocks.limit).toHaveBeenCalledWith(20)
        expect(mocks.select).toHaveBeenCalledWith("name email roles")
        expect((await response.json()).data).toEqual({ roles: [], users: [{ id: "maria", nome: "Maria", email: "maria@example.test", cargos: [{ id: "reader", nome: "Leitor", cor: "azul" }] }] })
    })
    it("nega consulta de opções a quem não é administrador real", async () => {
        mocks.resolveAccess.mockResolvedValue(accessFixture(["admin.access"]))
        expect((await GET(request("?kind=roles"))).status).toBe(403)
        expect(mocks.roleRows).not.toHaveBeenCalled()
    })
    it("rejeita busca excessiva antes de consultar o banco", async () => {
        expect((await GET(request(`?kind=users&q=${"a".repeat(129)}`))).status).toBe(400)
        expect(mocks.find).not.toHaveBeenCalled()
    })
})
