import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { resolve, relative } from "node:path"
import { NextRequest, NextResponse } from "next/server"
import { accessFixture } from "../../helpers/access-context"
import { currentAccess } from "@/features/access/server/context"
import { DomainError } from "@/lib/api/route"

const mocks = vi.hoisted(() => ({ auth: vi.fn(), resolveAccess: vi.fn() }))
vi.mock("@/auth", () => ({ auth: mocks.auth }))
vi.mock("@/features/access/server/access", async importOriginal => ({ ...await importOriginal<object>(), resolveAccess: mocks.resolveAccess }))
import { protectRoute } from "@/features/access/server/protect-route"

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("APP_ORIGIN", "https://ciliar.example")
    mocks.auth.mockResolvedValue({ user: { id: "a".repeat(24), sessionVersion: 0 } })
    mocks.resolveAccess.mockResolvedValue(accessFixture())
})
afterEach(() => vi.unstubAllEnvs())
const request = (path: string, method = "GET", headers: HeadersInit = {}) => new NextRequest(`https://ciliar.example${path}`, { method, headers })
const handler = vi.fn(async () => NextResponse.json({ actor: currentAccess().userId, permissions: [...currentAccess().effective] }))
const route = protectRoute(handler)
describe("proteção no servidor", () => {
    it("nega anônimo antes de executar o handler", async () => {
        mocks.auth.mockResolvedValue(null)
        const response = await route(request("/api/integrations"))
        expect(response.status).toBe(401); expect(handler).not.toHaveBeenCalled()
        expect(response.headers.get("cache-control")).toBe("no-store")
    })
    it.each(["/api/users", "/api/roles", "/api/integrations/smtp/logs", "/api/integrations/internal_api/tokens", "/api/ai/providers/gemini/usage", "/api/docs", "/api/openapi.json"])("nega acesso direto sem permissão: %s", async path => {
        mocks.resolveAccess.mockResolvedValue(accessFixture(["admin.access"]))
        expect((await route(request(path))).status).toBe(403)
    })
    it("publica somente dentro do contexto autenticado e ignora cookie de simulação de outra aba", async () => {
        const response = await route(request("/api/integrations", "GET", { cookie: "perfix-view-as=forged" }))
        expect(response.status).toBe(200)
        expect((await response.json()).actor).toBe("a".repeat(24))
        expect(mocks.resolveAccess).toHaveBeenCalledWith("a".repeat(24), "none", null, 0)
        expect(() => currentAccess()).toThrow(/sem contexto/)
    })
    it("passa explicitamente o marcador por requisição ao resolvedor", async () => {
        await route(request("/api/integrations", "GET", { "x-perfix-view-as": "simulação-da-aba" }))
        expect(mocks.resolveAccess).toHaveBeenCalledWith("a".repeat(24), "simulação-da-aba", null, 0)
    })
    it("sem o aceite da versão vigente dos termos, só a própria sessão e o aceite são liberados", async () => {
        mocks.resolveAccess.mockResolvedValue({ ...accessFixture(), legalAcceptanceRequired: true, legalVersion: 2 })
        const blocked = await route(request("/api/integrations"))
        expect(blocked.status).toBe(403)
        expect((await blocked.json()).code).toBe("TERMS_ACCEPTANCE_REQUIRED")
        expect((await route(request("/api/users"))).status).toBe(403)
        expect((await route(request("/api/me"))).status).toBe(200)
        expect((await route(request("/api/me/legal"))).status).toBe(200)
        expect((await route(request("/api/me/legal/accept", "POST", { origin: "https://ciliar.example", "x-ciliar-request": "1" }))).status).toBe(200)
        expect(handler).toHaveBeenCalledTimes(3)
    })
    it("a própria conta e o aceite não exigem acesso ao painel (cadastro público)", async () => {
        mocks.resolveAccess.mockResolvedValue(accessFixture([]))
        expect((await route(request("/api/me/legal"))).status).toBe(200)
        expect((await route(request("/api/integrations"))).status).toBe(403)
    })
    it("nega mutações sem origem canônica e marcador, inclusive com Host forjado", async () => {
        expect((await route(request("/api/users", "POST", { origin: "https://evil.example", host: "evil.example", "x-ciliar-request": "1" }))).status).toBe(403)
        expect((await route(request("/api/users", "POST", { origin: "https://ciliar.example" }))).status).toBe(403)
        expect((await route(request("/api/users", "POST", { origin: "https://ciliar.example", "x-ciliar-request": "1" }))).status).toBe(200)
    })
    it("sessão revogada e falha de banco nunca viram acesso público", async () => {
        mocks.resolveAccess.mockRejectedValue(new DomainError(401, "Sessão expirada", "UNAUTHORIZED"))
        expect((await route(request("/api/users"))).status).toBe(401)
        mocks.resolveAccess.mockRejectedValue(new Error("falha interna com detalhe sensível"))
        const response = await route(request("/api/users"))
        expect(response.status).toBe(500)
        expect(await response.text()).not.toContain("sensível")
    })
})
describe("cobertura estrutural das APIs existentes", () => {
    const root = resolve("src/app/api")
    const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(resolve(directory, entry.name)) : entry.name === "route.ts" ? [resolve(directory, entry.name)] : [])
    it("toda rota administrativa usa proteção; somente protocolo Auth.js, Bearer e cron são exceções", () => {
        const routes = files(root)
        expect(routes.length).toBeGreaterThan(20)
        for (const file of routes) {
            const name = relative(root, file)
            const source = readFileSync(file, "utf8")
            if (name.startsWith("auth/")) { expect(source).toContain("assertMutationOrigin"); continue }
            if (name.startsWith("v1/")) { expect(source).toContain("requireApiToken"); continue }
            if (name.startsWith("routines/")) { expect(source).toContain("verifySchedulerTickToken"); continue }
            expect(source, name).toContain("@/features/access/server/protect-route")
            expect(source, name).toMatch(/(?:withProtectedRoute|protectRoute|withRoute)(?:<[^>]+>)?\(/)
        }
    })
})
