import { describe, expect, it, vi, afterEach } from "vitest"
import { catalog, can } from "@/features/access/catalog"
import { createUserSchema, roleSchema, roleUpdateSchema, changePasswordSchema } from "@/features/access/schemas"
import { hashPassword, verifyPassword } from "@/features/auth/server/password"
import { checkRateLimit } from "@/features/auth/server/rate-limit"
import { assertMutationOrigin, appOrigin } from "@/features/auth/server/origin"
import { resolveScriptMongoUri } from "../../../scripts/helpers/mongodb-uri"
import { isChannelAuthorized } from "@/lib/pusher/channel-auth"
import { routePermissions } from "@/features/access/server/policy"
import { COLORS } from "@/features/access/schemas"
import { COLOR_TOKENS } from "@/lib/constants/color-palette"

afterEach(() => vi.unstubAllEnvs())
describe("catálogo e validação de acessos", () => {
    it("a paleta visual e os tokens aceitos pelo servidor são idênticos", () => expect(COLOR_TOKENS).toEqual([...COLORS]))
    it("normaliza a dependência de visualização e preserva apenas chaves conhecidas", () => {
        expect(catalog.normalizePermissionDependencies(["integrations.smtp.test"])).toContain("integrations.smtp.view")
        expect(catalog.sanitizePermissions(["*", "inexistente"])).toEqual(["*"])
        expect(can(new Set(["*"]), "users.edit")).toBe(true)
        expect(can(new Set(["users.view"]), "users.edit")).toBe(false)
    })
    it("normaliza e-mail e rejeita perfis duplicados e senhas fracas", () => {
        const good = { nome: "Nome", email: "  PESSOA@EXEMPLO.COM  ", password: "Senha forte 123!", ativo: true, cargos: ["a".repeat(24)] }
        expect(createUserSchema.parse(good).email).toBe("pessoa@exemplo.com")
        expect(createUserSchema.safeParse({ ...good, cargos: [...good.cargos, ...good.cargos] }).success).toBe(false)
        expect(createUserSchema.safeParse({ ...good, password: "123" }).success).toBe(false)
        expect(createUserSchema.safeParse({ ...good, unknown: true }).success).toBe(false)
    })
    it("não aceita wildcard, concessões desconhecidas, ou edição de slug pelo formulário", () => {
        const role = { nome: "Operador", descricao: "", cor: "roxo", ativo: true, permissoes: ["admin.access"] }
        expect(roleSchema.safeParse({ ...role, permissoes: ["*"] }).success).toBe(false)
        expect(roleSchema.safeParse({ ...role, permissoes: ["unknown"] }).success).toBe(false)
        expect(roleUpdateSchema.safeParse({ version: 0, slug: "admin" }).success).toBe(false)
        expect(changePasswordSchema.safeParse({ currentPassword: "atual", newPassword: "curta" }).success).toBe(false)
    })
    it("usa Argon2id e não aceita hashes inválidos", async () => {
        const hash = await hashPassword("Segredo temporário 123!")
        expect(hash).toMatch(/^\$argon2id\$/)
        expect(await verifyPassword(hash, "Segredo temporário 123!")).toBe(true)
        expect(await verifyPassword(hash, "outra senha")).toBe(false)
        expect(await verifyPassword("hash inválido", "senha")).toBe(false)
    })
    it("limita tentativas e libera nova janela", () => {
        checkRateLimit("teste:janela", 100, 2); checkRateLimit("teste:janela", 101, 2)
        expect(() => checkRateLimit("teste:janela", 102, 2)).toThrow(/Muitas tentativas/)
        expect(() => checkRateLimit("teste:janela", 1_000_000, 2)).not.toThrow()
    })
})
describe("origem, canais e CLI", () => {
    it("rejeita CSRF, origem ausente e marcador ausente", () => {
        vi.stubEnv("APP_ORIGIN", "https://ciliar.example")
        const request = (origin?: string, marker?: string) => new Request("https://ciliar.example/api/users", { method: "POST", headers: { ...(origin ? { origin } : {}), ...(marker ? { "x-ciliar-request": marker } : {}) } })
        expect(() => assertMutationOrigin(request("https://ciliar.example", "1"))).not.toThrow()
        for (const req of [request(), request("https://evil.example", "1"), request("https://ciliar.example")]) expect(() => assertMutationOrigin(req)).toThrow(/Origem/)
        expect(appOrigin()).toBe("https://ciliar.example")
    })
    it("separa canal administrativo de canais restritos e nunca autoriza canais desconhecidos", () => {
        const limited = new Set(["admin.access", "integrations.smtp.view"])
        expect(isChannelAuthorized("private-integration-smtp", limited)).toBe(true)
        expect(isChannelAuthorized("private-integration-pusher", limited)).toBe(false)
        expect(isChannelAuthorized("private-app", limited)).toBe(false)
        expect(isChannelAuthorized("private-app", new Set(["*"]))).toBe(true)
        expect(isChannelAuthorized("private-integration-github", new Set(["*"]))).toBe(false)
    })
    it("ajusta apenas o hostname Docker explicitamente configurado, sem expor credenciais", () => {
        expect(resolveScriptMongoUri("mongodb://user:pass@mongodb:27017/ciliar?authSource=ciliar")).toBe("mongodb://user:pass@127.0.0.1:27017/ciliar?authSource=ciliar")
        expect(resolveScriptMongoUri("mongodb://mongobd:27017/ciliar", "mongobd", "27018")).toBe("mongodb://127.0.0.1:27018/ciliar")
        expect(resolveScriptMongoUri("mongodb+srv://host/ciliar")).toBe("mongodb+srv://host/ciliar")
        expect(resolveScriptMongoUri("mongodb://mongodb:27017,second:27017/ciliar")).toBe("mongodb://mongodb:27017,second:27017/ciliar")
        expect(() => resolveScriptMongoUri(undefined)).toThrow(/MONGODB_URI/)
    })
})
describe("política das rotas administrativas", () => {
    it.each([
        ["GET", "/api/users", ["users.view"]], ["POST", "/api/users", ["users.create"]],
        ["PATCH", "/api/users/aaaaaaaaaaaaaaaaaaaaaaaa", ["users.edit"]], ["DELETE", "/api/users/aaaaaaaaaaaaaaaaaaaaaaaa", ["users.delete"]],
        ["GET", "/api/roles", ["roles.view"]], ["POST", "/api/roles", ["roles.edit"]],
        ["GET", "/api/integrations/smtp", ["integrations.smtp.view"]],
        ["PATCH", "/api/integrations/smtp", ["integrations.smtp.edit"]],
        ["POST", "/api/integrations/smtp/test", ["integrations.smtp.test"]],
        ["GET", "/api/integrations/smtp/logs", ["integrations.smtp.logs"]],
        ["POST", "/api/integrations/smtp/explore", ["integrations.smtp.explore"]],
        ["POST", "/api/integrations/crons/jobs/rotina/run", ["integrations.crons.run"]],
    ])("protege %s %s", (method, path, expected) => expect(routePermissions(path as string, method as string)).toEqual(expected))
    it("falha fechado para rota administrativa desconhecida", () => expect(() => routePermissions("/api/nova-rota", "GET")).toThrow())
})
