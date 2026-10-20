import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import type { NextAuthConfig } from "next-auth"
import type { JWT } from "next-auth/jwt"

const state = vi.hoisted(() => ({ factory: null as null | (() => NextAuthConfig), findOne: vi.fn(), updateOne: vi.fn(), resolve: vi.fn() }))
vi.mock("next-auth", () => ({ default: (factory: () => NextAuthConfig) => { state.factory = factory; return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() } } }))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/features/access/server/models", () => ({ accessModels: () => ({ users: { findOne: state.findOne, updateOne: state.updateOne } }) }))
vi.mock("@/features/auth/server/google-account", () => ({ resolveGoogleAccount: state.resolve }))
import "@/auth"

let config: NextAuthConfig
const id = "a".repeat(24)
const user = () => ({ id, name: "Pessoa", email: "pessoa@example.test", active: true, sessionVersion: 0 })
const account = { provider: "google", providerAccountId: "google-sub-1", type: "oidc" }
beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv("APP_ORIGIN", "https://ciliar.example"); vi.stubEnv("AUTH_URL", "https://ciliar.example"); vi.stubEnv("AUTH_SECRET", "segredo-temporario-exclusivo-dos-testes")
    vi.stubEnv("AUTH_GOOGLE_ID", "client-id"); vi.stubEnv("AUTH_GOOGLE_SECRET", "client-secret")
    config = state.factory!()
})
afterEach(() => vi.unstubAllEnvs())
const signIn = (input: { account?: unknown; profile?: unknown }) => (config.callbacks!.signIn as unknown as (input: unknown) => Promise<boolean | string>)(input)
const jwt = (token: JWT, linkedAccount?: unknown) => (config.callbacks!.jwt as unknown as (input: { token: JWT; account?: unknown }) => Promise<JWT | null>)({ token, account: linkedAccount })

describe("login somente com Google e ciclo da sessão", () => {
    it("tem um único provider Google (sem e-mail/senha) com as credenciais do ambiente", () => {
        expect(config.providers).toHaveLength(1)
        const provider = config.providers[0] as unknown as { id: string; options: { clientId: string; clientSecret: string } }
        expect(provider.id).toBe("google")
        expect(provider.options).toMatchObject({ clientId: "client-id", clientSecret: "client-secret" })
        expect(config.session).toMatchObject({ strategy: "jwt", maxAge: 28_800 })
    })
    it("repassa e-mail verificado para o vínculo e redireciona as recusas com o motivo", async () => {
        state.resolve.mockResolvedValue({ status: "ok", userId: id, sessionVersion: 0, outcome: "linked" })
        expect(await signIn({ account, profile: { email: "Pessoa@Example.test", email_verified: true, name: "Pessoa" } })).toBe(true)
        expect(state.resolve).toHaveBeenCalledWith({ sub: "google-sub-1", email: "Pessoa@Example.test", emailVerified: true, name: "Pessoa" })
        state.resolve.mockResolvedValue({ status: "denied", code: "inativo" })
        expect(await signIn({ account, profile: { email: "pessoa@example.test", email_verified: true } })).toBe("/login?erro=inativo")
        state.resolve.mockRejectedValue(new Error("banco fora"))
        expect(await signIn({ account, profile: { email: "pessoa@example.test", email_verified: true } })).toBe("/login?erro=falha")
        expect(await signIn({ account: { provider: "credentials", providerAccountId: "x" }, profile: {} })).toBe("/login?erro=falha")
    })
    it("e-mail não verificado chega como falso ao resolvedor (que recusa)", async () => {
        state.resolve.mockResolvedValue({ status: "denied", code: "nao-verificado" })
        expect(await signIn({ account, profile: { email: "pessoa@example.test", email_verified: "true" } })).toBe("/login?erro=nao-verificado")
        expect(state.resolve).toHaveBeenCalledWith(expect.objectContaining({ emailVerified: false }))
    })
    it("troca o sub do Google pelo usuário vinculado e revalida conta ativa e versão da sessão", async () => {
        state.findOne.mockResolvedValue(user())
        const token = await jwt({ sub: "google-sub-1", picture: "https://foto" }, account)
        expect(state.findOne).toHaveBeenNthCalledWith(1, { googleSub: "google-sub-1", active: true })
        expect(token).toMatchObject({ sub: id, sessionVersion: 0, name: "Pessoa" })
        expect(token).not.toHaveProperty("picture")
        state.findOne.mockResolvedValue(null)
        expect(await jwt(token!)).toBeNull()
        expect(await jwt({ sub: id })).toBeNull()
        expect(await jwt({ sub: "google-sub-1", sessionVersion: 0 })).toBeNull()
    })
    it("revoga somente a versão correta no logout", async () => {
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
