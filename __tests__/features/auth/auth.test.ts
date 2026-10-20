import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import type { NextAuthConfig } from "next-auth"
import type { JWT } from "next-auth/jwt"
import { hashPassword } from "@/features/auth/server/password"

const state = vi.hoisted(() => ({ factory: null as null | (() => NextAuthConfig), findOne: vi.fn(), updateOne: vi.fn() }))
vi.mock("next-auth", () => ({ default: (factory: () => NextAuthConfig) => { state.factory = factory; return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() } } }))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/features/access/server/models", () => ({ accessModels: () => ({ users: { findOne: state.findOne, updateOne: state.updateOne } }) }))
vi.mock("@/features/auth/server/rate-limit", () => ({ checkRateLimit: vi.fn() }))
import "@/auth"

let passwordHash: string
let config: NextAuthConfig
const id = "a".repeat(24)
const user = () => ({ id, name: "Pessoa", email: "pessoa@example.test", passwordHash, active: true, sessionVersion: 0, mustChangePassword: true })
beforeAll(async () => { passwordHash = await hashPassword("Senha de teste 123!") })
beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv("APP_ORIGIN", "https://ciliar.example"); vi.stubEnv("AUTH_URL", "https://ciliar.example"); vi.stubEnv("AUTH_SECRET", "segredo-temporario-exclusivo-dos-testes")
    config = state.factory!()
})
afterEach(() => vi.unstubAllEnvs())
const authorize = () => (config.providers[0] as unknown as { options: { authorize: (raw: unknown) => Promise<unknown> } }).options.authorize
const jwt = (token: JWT, account?: { id: string; sessionVersion: number }) => (config.callbacks!.jwt as unknown as (input: { token: JWT; user?: unknown }) => Promise<JWT | null>)({ token, user: account })
describe("autenticação por credenciais e ciclo da sessão", () => {
    it("autentica por e-mail normalizado, nunca retorna senha/hash", async () => {
        state.findOne.mockReturnValue({ select: vi.fn().mockResolvedValue(user()) })
        const result = await authorize()({ identifier: " PESSOA@EXAMPLE.TEST ", password: "Senha de teste 123!" })
        expect(result).toEqual({ id, name: "Pessoa", email: "pessoa@example.test", sessionVersion: 0 })
        expect(state.findOne).toHaveBeenCalledWith({ email: "pessoa@example.test" })
        expect(JSON.stringify(result)).not.toContain(passwordHash)
    })
    it("responde igualmente para senha incorreta, conta desconhecida ou inativa", async () => {
        for (const record of [user(), null, { ...user(), active: false }]) {
            state.findOne.mockReturnValue({ select: vi.fn().mockResolvedValue(record) })
            expect(await authorize()({ identifier: "pessoa@example.test", password: "Senha incorreta" })).toBeNull()
        }
    })
    it("revalida conta ativa e versão de sessão mesmo com JWT assinado", async () => {
        state.findOne.mockResolvedValue(user())
        const token = await jwt({}, { id, sessionVersion: 0 })
        expect(token).toMatchObject({ sub: id, sessionVersion: 0, mustChangePassword: true })
        state.findOne.mockResolvedValue(null)
        expect(await jwt(token!)).toBeNull()
        expect(await jwt({ sub: id })).toBeNull()
        expect(config.session).toMatchObject({ strategy: "jwt", maxAge: 28_800 })
    })
    it("ignora update de claims enviado pelo cliente e revoga somente a versão correta no logout", async () => {
        state.findOne.mockResolvedValue(user())
        expect(await jwt({ sub: id, sessionVersion: 0, mustChangePassword: false })).toMatchObject({ mustChangePassword: true })
        const logout = config.events!.signOut as unknown as (message: { token: JWT }) => Promise<void>
        await logout({ token: { sub: id, sessionVersion: 0 } })
        expect(state.updateOne).toHaveBeenCalledWith({ _id: id, sessionVersion: 0 }, { $inc: { sessionVersion: 1 } })
    })
    it("recusa redirects externos, malformados e com contrabarra", async () => {
        const redirect = config.callbacks!.redirect!
        for (const url of ["https://evil.example", "//evil.example", "/\\evil.example", "inválida"]) expect(await redirect({ url, baseUrl: "https://ciliar.example" })).toBe("https://ciliar.example")
        expect(await redirect({ url: "/integracoes", baseUrl: "https://ciliar.example" })).toBe("https://ciliar.example/integracoes")
    })
})
