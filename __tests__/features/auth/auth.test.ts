import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import type { NextAuthConfig } from "next-auth"
import type { JWT } from "next-auth/jwt"

type Factory = (request?: Request) => Promise<NextAuthConfig>
const state = vi.hoisted(() => ({ factory: null as null | Factory, findOne: vi.fn(), updateOne: vi.fn(), resolve: vi.fn(), verify: vi.fn(), methods: ["google"] as string[] }))
vi.mock("next-auth", () => ({ default: (factory: Factory) => { state.factory = factory; return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() } } }))
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn() }))
vi.mock("@/features/access/server/models", () => ({ accessModels: () => ({ users: { findOne: state.findOne, updateOne: state.updateOne } }) }))
vi.mock("@/features/auth/server/google-account", () => ({ resolveGoogleAccount: state.resolve }))
vi.mock("@/features/auth/server/password", () => ({ verifyPassword: state.verify, getDummyHash: async () => "dummy-hash" }))
vi.mock("@/features/auth/server/origin", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    requestAuthContext: async () => ({ resolved: { protocol: "https", host: "ciliar.example", origin: "https://ciliar.example", allowed: true }, methods: state.methods }),
}))
import "@/auth"

let config: NextAuthConfig
const id = "a".repeat(24)
const user = () => ({ id, name: "Pessoa", email: "pessoa@example.test", active: true, sessionVersion: 0 })
const account = { provider: "google", providerAccountId: "google-sub-1", type: "oidc" }
const select = (value: unknown) => ({ select: () => Promise.resolve(value) })
beforeEach(async () => {
    vi.clearAllMocks(); vi.stubEnv("APP_ORIGIN", "https://ciliar.example"); vi.stubEnv("AUTH_SECRET", "segredo-temporario-exclusivo-dos-testes")
    vi.stubEnv("AUTH_GOOGLE_ID", "client-id"); vi.stubEnv("AUTH_GOOGLE_SECRET", "client-secret")
    state.methods = ["google"]
    config = await state.factory!(new Request("https://ciliar.example/api/auth/session", { headers: { "x-forwarded-proto": "https" } }))
})
afterEach(() => vi.unstubAllEnvs())
const signIn = (input: { account?: unknown; profile?: unknown }) => (config.callbacks!.signIn as unknown as (input: unknown) => Promise<boolean | string>)(input)
const jwt = (token: JWT, linkedAccount?: unknown, signedUser?: unknown) => (config.callbacks!.jwt as unknown as (input: { token: JWT; account?: unknown; user?: unknown }) => Promise<JWT | null>)({ token, account: linkedAccount, user: signedUser })
const authorize = (credentials: unknown) => {
    const provider = config.providers.find((item) => (item as { id: string }).id === "credentials") as unknown as { options: { authorize: (raw: unknown, request: Request) => Promise<unknown> } }
    return provider.options.authorize(credentials, new Request("https://ciliar.example/api/auth/callback/credentials", { method: "POST" }))
}

describe("Auth.js: Google e e-mail/senha, ciclo da sessão", () => {
    it("tem os providers Google (credenciais do ambiente) e e-mail/senha, JWT de 8h", () => {
        expect(config.providers.map((provider) => (provider as unknown as { id: string }).id)).toEqual(["google", "credentials"])
        const google = config.providers[0] as unknown as { options: { clientId: string; clientSecret: string } }
        expect(google.options).toMatchObject({ clientId: "client-id", clientSecret: "client-secret" })
        expect(config.session).toMatchObject({ strategy: "jwt", maxAge: 28_800 })
    })
    it("cookies seguros só em HTTPS (protocolo da requisição) e sem AUTH_URL fixo", async () => {
        expect(config.useSecureCookies).toBe(true)
        const http = await state.factory!(new Request("http://217.77.3.47:4003/api/auth/session", { headers: { "x-forwarded-proto": "http" } }))
        expect(http.useSecureCookies).toBe(false)
        expect(process.env.AUTH_URL).toBeUndefined()
    })
    it("repassa e-mail verificado para o vínculo e redireciona as recusas com o motivo", async () => {
        state.resolve.mockResolvedValue({ status: "ok", userId: id, sessionVersion: 0, outcome: "linked" })
        expect(await signIn({ account, profile: { email: "Pessoa@Example.test", email_verified: true, name: "Pessoa" } })).toBe(true)
        expect(state.resolve).toHaveBeenCalledWith({ sub: "google-sub-1", email: "Pessoa@Example.test", emailVerified: true, name: "Pessoa" })
        state.resolve.mockResolvedValue({ status: "denied", code: "inativo" })
        expect(await signIn({ account, profile: { email: "pessoa@example.test", email_verified: true } })).toBe("/login?erro=inativo")
        state.resolve.mockRejectedValue(new Error("banco fora"))
        expect(await signIn({ account, profile: { email: "pessoa@example.test", email_verified: true } })).toBe("/login?erro=falha")
        expect(await signIn({ account: { provider: "github", providerAccountId: "x" }, profile: {} })).toBe("/login?erro=falha")
        expect(await signIn({ account: { provider: "credentials", providerAccountId: id }, profile: {} })).toBe(true)
    })
    it("e-mail não verificado chega como falso ao resolvedor (que recusa)", async () => {
        state.resolve.mockResolvedValue({ status: "denied", code: "nao-verificado" })
        expect(await signIn({ account, profile: { email: "pessoa@example.test", email_verified: "true" } })).toBe("/login?erro=nao-verificado")
        expect(state.resolve).toHaveBeenCalledWith(expect.objectContaining({ emailVerified: false }))
    })
    it("e-mail e senha: só com o método habilitado, senha correta, conta ativa e com senha", async () => {
        const credentials = { identifier: " PESSOA@example.test ", password: "senha-muito-segura" }
        state.findOne.mockReturnValue(select({ ...user(), _id: id, passwordHash: "hash" }))
        state.verify.mockResolvedValue(true)
        expect(await authorize(credentials)).toBeNull()
        expect(state.findOne).not.toHaveBeenCalled()
        state.methods = ["password"]
        expect(await authorize(credentials)).toEqual({ id, name: "Pessoa", email: "pessoa@example.test", sessionVersion: 0 })
        expect(state.findOne).toHaveBeenCalledWith({ email: "pessoa@example.test" })
        expect(state.updateOne).toHaveBeenCalledWith({ _id: id }, { $set: { lastLoginAt: expect.any(Date) } })
        state.verify.mockResolvedValue(false)
        expect(await authorize(credentials)).toBeNull()
        state.verify.mockResolvedValue(true)
        state.findOne.mockReturnValue(select({ ...user(), _id: id, active: false, passwordHash: "hash" }))
        expect(await authorize(credentials)).toBeNull()
        // Conta inexistente compara com o hash falso (tempo equivalente) e recusa.
        state.findOne.mockReturnValue(select(null))
        expect(await authorize(credentials)).toBeNull()
        expect(state.verify).toHaveBeenLastCalledWith("dummy-hash", "senha-muito-segura")
        // Conta só com Google (sem senha) também recusa.
        state.findOne.mockReturnValue(select({ ...user(), _id: id, passwordHash: undefined }))
        expect(await authorize(credentials)).toBeNull()
        expect(await authorize({ identifier: "inválido", password: "x" })).toBeNull()
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
    it("primeiro token do login por senha usa o usuário do authorize e revalida a versão", async () => {
        state.findOne.mockResolvedValue(user())
        const token = await jwt({}, { provider: "credentials", type: "credentials", providerAccountId: id }, { id, sessionVersion: 0 })
        expect(token).toMatchObject({ sub: id, sessionVersion: 0, email: "pessoa@example.test" })
        expect(state.findOne).toHaveBeenCalledWith({ _id: id, active: true, sessionVersion: 0 })
        expect(await jwt({}, { provider: "credentials", type: "credentials", providerAccountId: id }, { id })).toBeNull()
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
