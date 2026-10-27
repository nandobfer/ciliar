import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const state = vi.hoisted(() => ({ handler: vi.fn() }))
vi.mock("@/auth", () => ({ handlers: { GET: state.handler, POST: state.handler } }))
import { GET, POST } from "@/app/api/auth/[...nextauth]/route"
import { cachedAuthSettings } from "@/features/authentication/server/state"
import type { AuthSettings } from "@/features/authentication/schemas"

const settings = (http: AuthSettings["methods"]["http"], https: AuthSettings["methods"]["https"]): AuthSettings => ({ methods: { http, https }, extraHosts: ["217.77.3.47"] })
const HTTP = { host: "217.77.3.47:4003", "x-forwarded-proto": "http", origin: "http://217.77.3.47:4003" }
const HTTPS = { host: "ciliar.example", "x-forwarded-proto": "https", origin: "https://ciliar.example" }
let ip = 0
const request = (path: string, method: "GET" | "POST", headers: Record<string, string>, body?: string) =>
    new NextRequest(`http://0.0.0.0:3000${path}`, { method, headers: { ...headers, "cf-connecting-ip": `10.0.0.${++ip}`, ...(body ? { "content-type": "application/x-www-form-urlencoded", "x-auth-return-redirect": "1" } : {}) }, body })

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("APP_ORIGIN", "https://ciliar.example")
    state.handler.mockImplementation(async (req: Request) => Response.json({ url: req.url, host: req.headers.get("host") }))
})
afterEach(() => vi.unstubAllEnvs())

describe("rota do Auth.js: métodos por protocolo e endereços permitidos", () => {
    it("HTTP só com e-mail e senha: recusa o Google e aceita o login por senha na origem do IP", async () => {
        vi.mocked(cachedAuthSettings).mockResolvedValue(settings(["password"], ["google"]))
        const google = await POST(request("/api/auth/signin/google", "POST", HTTP, "csrfToken=x"))
        expect(google.status).toBe(403)
        expect(await google.json()).toEqual({ url: "http://217.77.3.47:4003/login?erro=metodo-indisponivel&error=MetodoIndisponivel" })
        const callback = await GET(request("/api/auth/callback/google?code=x", "GET", { host: HTTP.host, "x-forwarded-proto": "http" }))
        expect(callback.status).toBe(303)
        expect(callback.headers.get("location")).toBe("http://217.77.3.47:4003/login?erro=metodo-indisponivel&error=MetodoIndisponivel")
        const password = await POST(request("/api/auth/callback/credentials", "POST", HTTP, "identifier=a%40b.test&password=x"))
        expect(password.status).toBe(200)
        expect(await password.json()).toEqual({ url: "http://217.77.3.47:4003/api/auth/callback/credentials", host: "217.77.3.47:4003" })
        expect(state.handler).toHaveBeenCalledTimes(1)
    })
    it("HTTPS só com Google: recusa a senha (inclusive chamada direta) e aceita o Google", async () => {
        vi.mocked(cachedAuthSettings).mockResolvedValue(settings(["password"], ["google"]))
        const password = await POST(request("/api/auth/callback/credentials", "POST", HTTPS, "identifier=a%40b.test&password=x"))
        expect(password.status).toBe(403)
        expect((await password.json()).url).toContain("error=MetodoIndisponivel")
        const google = await POST(request("/api/auth/signin/google", "POST", HTTPS, "csrfToken=x"))
        expect(google.status).toBe(200)
        expect((await google.json()).url).toBe("https://ciliar.example/api/auth/signin/google")
    })
    it("sessão, CSRF e providers não dependem do método", async () => {
        vi.mocked(cachedAuthSettings).mockResolvedValue(settings(["password"], ["password"]))
        for (const path of ["/api/auth/session", "/api/auth/csrf", "/api/auth/providers"]) expect((await GET(request(path, "GET", { host: HTTP.host, "x-forwarded-proto": "http" }))).status).toBe(200)
    })
    it("endereço fora da lista e origem de outro site são recusados", async () => {
        vi.mocked(cachedAuthSettings).mockResolvedValue(settings(["google", "password"], ["google", "password"]))
        const foreign = await GET(request("/api/auth/session", "GET", { host: "evil.example", "x-forwarded-proto": "https" }))
        expect(foreign.status).toBe(403)
        expect((await foreign.json()).code).toBe("HOST_NOT_ALLOWED")
        const csrf = await POST(request("/api/auth/callback/credentials", "POST", { ...HTTP, origin: "https://evil.example" }, "identifier=a%40b.test&password=x"))
        expect(csrf.status).toBe(403)
        expect(state.handler).not.toHaveBeenCalled()
    })
    it("limita tentativas de senha por e-mail", async () => {
        vi.mocked(cachedAuthSettings).mockResolvedValue(settings(["password"], ["password"]))
        const attempt = () => POST(request("/api/auth/callback/credentials", "POST", HTTP, "identifier=limite%40b.test&password=x"))
        for (let index = 0; index < 10; index++) expect((await attempt()).status).toBe(200)
        const blocked = await attempt()
        expect(blocked.status).toBe(429)
        expect((await blocked.json()).url).toContain("erro=muitas-tentativas")
    })
    it("limite por e-mail vale também com corpo JSON e IP forjado a cada tentativa; outro formato é recusado", async () => {
        vi.mocked(cachedAuthSettings).mockResolvedValue(settings(["password"], ["password"]))
        const json = (identifier: string) => POST(new NextRequest("http://0.0.0.0:3000/api/auth/callback/credentials", {
            method: "POST",
            headers: { ...HTTP, "content-type": "application/json", "x-auth-return-redirect": "1", "cf-connecting-ip": `10.9.${++ip}.1` },
            body: JSON.stringify({ identifier, password: "x", csrfToken: "x" }),
        }))
        for (let index = 0; index < 10; index++) expect((await json(index % 2 ? "JSON@b.test" : " json@b.test ")).status).toBe(200)
        expect((await json("json@b.test")).status).toBe(429)
        const plain = await POST(new NextRequest("http://0.0.0.0:3000/api/auth/callback/credentials", { method: "POST", headers: { ...HTTP, "content-type": "text/plain", "x-auth-return-redirect": "1" }, body: "identifier=outro@b.test" }))
        expect(plain.status).toBe(400)
        expect(state.handler).toHaveBeenCalledTimes(10)
    })
    it("identifier repetido no urlencoded é recusado (o Auth.js usaria o último valor) e o limite conta o mesmo e-mail do authorize", async () => {
        vi.mocked(cachedAuthSettings).mockResolvedValue(settings(["password"], ["password"]))
        for (const body of ["identifier=x1&identifier=vitima%40b.test&password=x", "identifier=vitima%40b.test&identifier=x2&password=x"]) {
            const refused = await POST(request("/api/auth/callback/credentials", "POST", HTTP, body))
            expect(refused.status).toBe(400)
        }
        expect(state.handler).not.toHaveBeenCalled()
        // Multipart não é lido pelo Auth.js: também recusado.
        const form = new FormData(); form.set("identifier", "vitima@b.test"); form.set("password", "x")
        const multipart = await POST(new NextRequest("http://0.0.0.0:3000/api/auth/callback/credentials", { method: "POST", headers: { ...HTTP, "x-auth-return-redirect": "1" }, body: form }))
        expect(multipart.status).toBe(400)
        for (let index = 0; index < 10; index++) expect((await POST(request("/api/auth/callback/credentials", "POST", HTTP, `identifier=vitima%40b.test&password=${index}`))).status).toBe(200)
        expect((await POST(request("/api/auth/callback/credentials", "POST", HTTP, "identifier=VITIMA%40b.test&password=z"))).status).toBe(429)
    })
})
