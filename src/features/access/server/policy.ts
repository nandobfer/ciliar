import { DomainError } from "@/lib/api/route"
import { isIntegrationId } from "@/lib/integrations/catalog"

/** Lista explícita de capacidades. Rotas desconhecidas nunca recebem autorização por padrão. */
export function routePermissions(path: string, method: string): string[] {
    if (path === "/api/me" || path === "/api/me/legal" || path === "/api/me/legal/accept" || path.startsWith("/api/access/view-as")) return []
    if (path === "/api/users/assignable-roles") return [] // requireAny no handler
    if (path === "/api/users") return [method === "GET" ? "users.view" : "users.create"]
    if (path === "/api/users/invite") return ["users.create"]
    if (/^\/api\/users\/[a-f\d]{24}\/invite$/i.test(path)) return ["users.create"]
    if (/^\/api\/users\/[a-f\d]{24}$/i.test(path)) return [method === "GET" ? "users.view" : method === "DELETE" ? "users.delete" : "users.edit"]
    if (path === "/api/platform/settings" || path === "/api/platform/legal") return [`integrations.platform.${method === "GET" ? "view" : "edit"}`]
    if (/^\/api\/roles(?:\/|$)/.test(path)) return [method === "GET" ? "roles.view" : "roles.edit"]
    if (path === "/api/integrations" || path === "/api/pusher/auth") return []
    if (/^\/api\/opex(?:\/|$)/.test(path)) return ["opex.use"]
    if (path === "/api/ai/features/opex-agent") return [method === "GET" ? "integrations.ai.view" : "integrations.ai.edit"]
    if (path === "/api/docs" || path === "/api/openapi.json") return ["integrations.internal_api.view"]
    const provider = /^\/api\/ai\/providers\/([^/]+)\/(?:models|usage)$/.exec(path)
    if (provider && ["opencode", "gemini", "anthropic", "openai", "deepseek", "jev"].includes(provider[1]!)) return [`integrations.ai_${provider[1]}.view`]
    const integration = /^\/api\/integrations\/([^/]+)(?:\/(.*))?$/.exec(path)
    if (integration && isIntegrationId(integration[1]!)) {
        const [, id, tail] = integration
        if (!tail) return [`integrations.${id}.${method === "GET" ? "view" : "edit"}`]
        if (tail === "test") return [`integrations.${id}.test`]
        if (tail === "logs") return [`integrations.${id}.logs`]
        if (tail === "explore") return [`integrations.${id}.explore`]
        if (tail === "openapi") return [`integrations.${id}.view`]
        if (id === "internal_api" && /^tokens(?:\/[^/]+)?$/.test(tail)) return ["integrations.internal_api.tokens"]
        if (id === "crons" && /^jobs\/[^/]+\/run$/.test(tail)) return ["integrations.crons.run"]
    }
    throw new DomainError(404, "Rota não encontrada", "NOT_FOUND")
}
