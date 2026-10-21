import { DomainError } from "@/lib/api/route"
import { isIntegrationId } from "@/lib/integrations/catalog"

/**
 * Rotas que não exigem o painel (`admin.access`): a própria conta, sair da simulação, o Pusher
 * (cada canal confere a sua permissão) e as do prestador (Negócios, clientes, pedidos, trabalhos, entrevista e Agente Opex, que
 * conferem `businesses.use`/`opex.use` e as permissões de cada ferramenta).
 */
export function requiresPanel(path: string): boolean {
    if (path === "/api/me" || path.startsWith("/api/me/") || path.startsWith("/api/access/view-as") || path === "/api/pusher/auth") return false
    return !/^\/api\/(?:businesses|interview|opex|clients|orders|works)(?:\/|$)/.test(path)
}

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
    if (path === "/api/ai/features/opex-agent" || path === "/api/ai/features/summary" || path === "/api/ai/features/business-interviewer" || path === "/api/ai/features/business-interviewer/script" || path === "/api/ai/features/order-title") return [method === "GET" ? "integrations.ai.view" : "integrations.ai.edit"]
    // Memórias dos agentes: o agente é conferido no catálogo pelo serviço.
    if (/^\/api\/ai\/agents\/[a-z][a-z-]{0,40}\/memories(?:\/[a-f\d]{24})?$/i.test(path)) return [method === "GET" ? "ai_memories.view" : "ai_memories.edit"]
    // Negócios (M1) e espaço do negócio (M2): leitura confere dono/suporte no serviço; alterações só do dono (`businesses.use`).
    if (path === "/api/businesses") return [] // requireAny no handler (use ou view_all)
    if (path === "/api/businesses/search") return ["businesses.view_all"]
    if (/^\/api\/businesses\/[a-f\d]{24}(?:\/(?:archive|restore|logo|interview|dashboard|categories)|\/(?:activities|goals|documents|successes|files)(?:\/[a-f\d]{24}(?:\/(?:archive|restore|complete))?)?)?$/i.test(path)) return method === "GET" ? [] : ["businesses.use"]
    // Clientes e pedidos (M3): leitura confere dono/suporte no serviço; alterações só do dono. O link público (`/api/public/orders`) não usa sessão.
    if (/^\/api\/businesses\/[a-f\d]{24}\/orders(?:\/[a-f\d]{24}(?:\/(?:send|revoke|accept|reject|reopen|cancel|regenerate-title|link))?)?$/i.test(path)) return method === "GET" ? [] : ["businesses.use"]
    if (method === "GET" && /^\/api\/businesses\/[a-f\d]{24}\/orders\/[a-f\d]{24}\/versions\/\d+$/i.test(path)) return []
    if (/^\/api\/clients(?:\/[a-f\d]{24}(?:\/(?:archive|restore))?)?$/i.test(path)) return method === "GET" ? [] : ["businesses.use"]
    if (path === "/api/orders") return [] // requireAny no serviço (use ou view_all)
    // Trabalhos (M4): leitura confere dono/suporte no serviço; alterações só do dono.
    if (/^\/api\/businesses\/[a-f\d]{24}\/works(?:\/[a-f\d]{24}(?:\/(?:move|payment|unpay|archive|restore|notes|attachments|time-entries)(?:\/[a-f\d]{24})?)?)?$/i.test(path)) return method === "GET" ? [] : ["businesses.use"]
    if (/^\/api\/businesses\/[a-f\d]{24}\/work-columns(?:\/(?:order|col-[a-z0-9]{6,24}))?$/i.test(path)) return method === "GET" ? [] : ["businesses.use"]
    if (path === "/api/works" || path === "/api/works/payment-methods") return method === "GET" ? [] : ["businesses.use"] // requireAny no serviço
    if (/^\/api\/interview(?:\/|$)/.test(path)) return ["businesses.use"]
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
