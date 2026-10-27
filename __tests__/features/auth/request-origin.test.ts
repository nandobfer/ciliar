import { describe, expect, it } from "vitest"
import { allowedHostnames, hostnameOf, normalizeAccessHost, requestHost, requestProtocol, resolveRequestOrigin } from "@/features/auth/request-origin"
import { authMethodOfPath } from "@/features/auth/auth-paths"
import { authSettingsSchema, DEFAULT_AUTH_SETTINGS } from "@/features/authentication/schemas"

const APP = "https://ciliar.nandoburgos.dev"
const headers = (values: Record<string, string>) => new Headers(values)
const resolve = (values: Record<string, string>, url = "http://0.0.0.0:3000/login", extraHosts = ["217.77.3.47"]) => resolveRequestOrigin({ headers: headers(values), url, appOrigin: APP, extraHosts })

describe("protocolo e origem da requisição (proxy reverso ou acesso direto)", () => {
    it("protocolo vem do X-Forwarded-Proto (primeiro valor) e, sem ele, da conexão", () => {
        expect(requestProtocol(headers({ "x-forwarded-proto": "https" }), "http://x/")).toBe("https")
        expect(requestProtocol(headers({ "x-forwarded-proto": "HTTP, https" }), "https://x/")).toBe("http")
        expect(requestProtocol(headers({}), "https://x/")).toBe("https")
        expect(requestProtocol(headers({}), "http://x/")).toBe("http")
        expect(requestProtocol(headers({ "x-forwarded-proto": "gopher" }), "http://x/")).toBe("http")
    })
    it("host vem do X-Forwarded-Host, depois do Host e por fim da URL", () => {
        expect(requestHost(headers({ "x-forwarded-host": "ciliar.nandoburgos.dev, interno", host: "app:3000" }), "http://x/")).toBe("ciliar.nandoburgos.dev")
        expect(requestHost(headers({ host: "217.77.3.47:4003" }), "http://x/")).toBe("217.77.3.47:4003")
        expect(requestHost(headers({}), "http://localhost:3101/")).toBe("localhost:3101")
        expect(hostnameOf("[::1]:3000")).toBe("[::1]")
        expect(hostnameOf("evil.example/@x")).toBeNull()
    })
    it("HTTP pelo IP liberado vale em qualquer porta; HTTPS pelo domínio oficial", () => {
        expect(resolve({ host: "217.77.3.47:4003", "x-forwarded-proto": "http" })).toEqual({ protocol: "http", host: "217.77.3.47:4003", origin: "http://217.77.3.47:4003", allowed: true })
        expect(resolve({ host: "217.77.3.47:8080", "x-forwarded-proto": "http" })).toMatchObject({ origin: "http://217.77.3.47:8080", allowed: true })
        expect(resolve({ host: "ciliar.nandoburgos.dev", "x-forwarded-proto": "https" })).toEqual({ protocol: "https", host: "ciliar.nandoburgos.dev", origin: APP, allowed: true })
    })
    it("host fora da lista cai no APP_ORIGIN e fica não permitido (Host forjado)", () => {
        expect(resolve({ host: "evil.example", "x-forwarded-proto": "https" })).toEqual({ protocol: "https", host: "ciliar.nandoburgos.dev", origin: APP, allowed: false })
        expect(resolve({ host: "217.77.3.48:4003" })).toMatchObject({ allowed: false })
        expect(resolve({ host: "217.77.3.47:4003" }, "http://x/", [])).toMatchObject({ allowed: false })
    })
    it("lista de endereços aceita só host (domínio, IPv4 ou IPv6), sem protocolo, porta ou caminho", () => {
        expect(normalizeAccessHost(" 217.77.3.47 ")).toBe("217.77.3.47")
        expect(normalizeAccessHost("Ciliar.Example.com")).toBe("ciliar.example.com")
        expect(normalizeAccessHost("::1")).toBe("[::1]")
        expect(normalizeAccessHost("[2001:db8::1]")).toBe("[2001:db8::1]")
        for (const invalid of ["http://217.77.3.47", "217.77.3.47:4003", "[::1]:80", "host/caminho", "user@host", "", "a b"]) expect(normalizeAccessHost(invalid)).toBeNull()
        expect([...allowedHostnames(APP, ["217.77.3.47", "inválido:80"])]).toEqual(["217.77.3.47", "ciliar.nandoburgos.dev"])
    })
})

describe("configuração de métodos por protocolo", () => {
    it("padrão só Google; qualquer combinação, ao menos um por protocolo; hosts normalizados", () => {
        expect(DEFAULT_AUTH_SETTINGS).toEqual({ methods: { http: ["google"], https: ["google"] }, extraHosts: [] })
        expect(authSettingsSchema.parse({ methods: { http: ["password"], https: ["password", "google"] }, extraHosts: [" 217.77.3.47 "] })).toEqual({ methods: { http: ["password"], https: ["google", "password"] }, extraHosts: ["217.77.3.47"] })
        expect(authSettingsSchema.safeParse({ methods: { http: [], https: ["google"] }, extraHosts: [] }).success).toBe(false)
        expect(authSettingsSchema.safeParse({ methods: { http: ["google", "google"], https: ["google"] }, extraHosts: [] }).success).toBe(false)
        expect(authSettingsSchema.safeParse({ methods: { http: ["github"], https: ["google"] }, extraHosts: [] }).success).toBe(false)
        expect(authSettingsSchema.safeParse({ methods: { http: ["google"], https: ["google"] }, extraHosts: ["217.77.3.47:4003"] }).success).toBe(false)
        expect(authSettingsSchema.safeParse({ methods: { http: ["google"], https: ["google"] }, extraHosts: ["a.com", "A.com"] }).success).toBe(false)
    })
    it("mapeia as rotas do Auth.js para o método", () => {
        expect(authMethodOfPath("/api/auth/signin/google")).toBe("google")
        expect(authMethodOfPath("/api/auth/callback/google")).toBe("google")
        expect(authMethodOfPath("/api/auth/callback/credentials")).toBe("password")
        expect(authMethodOfPath("/api/auth/signin/credentials")).toBe("password")
        for (const path of ["/api/auth/session", "/api/auth/csrf", "/api/auth/providers", "/api/auth/signout", "/api/auth/signin/github"]) expect(authMethodOfPath(path)).toBeNull()
    })
})
