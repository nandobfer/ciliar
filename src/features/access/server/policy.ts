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
    if (path === "/api/me" || path === "/api/me/legal" || path === "/api/me/legal/accept" || path === "/api/me/password" || path.startsWith("/api/access/view-as")) return []
    if (path === "/api/users/assignable-roles") return [] // requireAny no handler
    if (path === "/api/users") return [method === "GET" ? "users.view" : "users.create"]
    if (path === "/api/users/invite") return ["users.create"]
    if (/^\/api\/users\/[a-f\d]{24}\/invite$/i.test(path)) return ["users.create"]
    if (/^\/api\/users\/[a-f\d]{24}\/password$/i.test(path)) return ["users.edit"]
    if (path === "/api/authentication/settings") return [`integrations.authentication.${method === "GET" ? "view" : "edit"}`]
    if (/^\/api\/users\/[a-f\d]{24}$/i.test(path)) return [method === "GET" ? "users.view" : method === "DELETE" ? "users.delete" : "users.edit"]
    if (path === "/api/platform/settings" || path === "/api/platform/legal") return [`integrations.platform.${method === "GET" ? "view" : "edit"}`]
    if (/^\/api\/roles(?:\/|$)/.test(path)) return [method === "GET" ? "roles.view" : "roles.edit"]
    if (path === "/api/integrations" || path === "/api/pusher/auth") return []
    if (/^\/api\/opex(?:\/|$)/.test(path)) return ["opex.use"]
    if (path === "/api/ai/features/opex-agent" || path === "/api/ai/features/summary" || path === "/api/ai/features/business-interviewer" || path === "/api/ai/features/business-interviewer/script" || path === "/api/ai/features/order-title") return [method === "GET" ? "integrations.ai.view" : "integrations.ai.edit"]
    // Memórias dos agentes: o agente é conferido no catálogo pelo serviço.
    if (/^\/api\/ai\/agents\/[a-z][a-z-]{0,40}\/memories(?:\/[a-f\d]{24})?$/i.test(path)) return [method === "GET" ? "ai_memories.view" : "ai_memories.edit"]
    const business = businessRoutePermissions(path, method)
    if (business) return business
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

const ID = "[a-f\\d]{24}"
const SPACE_ITEMS: Record<string, string> = { activities: "activities", goals: "goals", documents: "documents", successes: "successes", "portfolio-items": "portfolio" }
const ORDER_ACTIONS: Record<string, string> = { send: "orders.send", revoke: "orders.send", accept: "orders.decide", reject: "orders.decide", reopen: "orders.decide", cancel: "orders.decide", "regenerate-title": "orders.edit" }
const WORK_ACTIONS: Record<string, string> = { payment: "works.payment", unpay: "works.payment" }

/**
 * Rotas dos Negócios por módulo (permissões em `features/businesses/permissions.ts`). Leituras (`GET`)
 * conferem dono/suporte e a visualização do módulo no serviço (`[]` aqui); alterações exigem a base
 * `businesses.use` e a chave do módulo. Os links públicos (`/api/public/**`) não usam sessão.
 * `null` = não é rota de negócio.
 */
export function businessRoutePermissions(path: string, method: string): string[] | null {
    const read = method === "GET"
    const write = (...keys: string[]) => (read ? [] : ["businesses.use", ...keys])
    if (path === "/api/businesses") return [] // requireAny no handler (use ou view_all)
    if (path === "/api/businesses/search") return ["businesses.view_all"]
    if (/^\/api\/interview(?:\/|$)/.test(path)) return ["businesses.use", "businesses.create"]
    if (/^\/api\/clients(?:\/[a-f\d]{24}(?:\/(?:archive|restore))?)?$/i.test(path)) return write(method === "DELETE" ? "clients.delete" : "clients.edit")
    if (path === "/api/orders" || path === "/api/works" || path === "/api/works/payment-methods") return read ? [] : null // requireModuleRead no serviço
    const match = new RegExp(`^/api/businesses/(${ID})(?:/(.*))?$`, "i").exec(path)
    if (!match) return null
    const tail = match[2] ?? ""
    // O negócio: ficha (PATCH), exclusão (DELETE), arquivar/restaurar, logo, entrevista, dashboard e categorias.
    if (!tail) return write(method === "DELETE" ? "businesses.delete" : "businesses.edit")
    if (tail === "archive" || tail === "restore") return write("businesses.archive")
    if (tail === "logo") return write("businesses.edit")
    if (tail === "interview" || tail === "dashboard" || tail === "categories") return read ? [] : null
    // Último acesso (ordena o seletor): o serviço confere o negócio visível (dono ou suporte).
    if (tail === "access") return method === "POST" ? [] : null
    // Arquivos: a finalidade decide a edição exigida (BUSINESS_FILE_PERMISSIONS, no serviço).
    if (new RegExp(`^files(?:/${ID}(?:/complete)?)?$`, "i").test(tail)) return write()
    // Itens do espaço (M2) e itens avulsos do portfólio (M5).
    const item = new RegExp(`^(activities|goals|documents|successes|portfolio-items)(?:/(tags|${ID})(?:/(archive|restore))?)?$`, "i").exec(tail)
    if (item) {
        const area = SPACE_ITEMS[item[1]!]!
        if (item[2] === "tags") return read ? [] : null
        return write(method === "DELETE" && !item[3] ? (area === "portfolio" ? "portfolio.edit" : `${area}.delete`) : `${area}.edit`)
    }
    // Pedidos (M3).
    const order = new RegExp(`^orders(?:/(${ID})(?:/(send|revoke|accept|reject|reopen|cancel|regenerate-title|link|versions/\\d+))?)?$`, "i").exec(tail)
    if (order) {
        const action = order[2]
        if (action === "link" || action?.startsWith("versions/")) return read ? [] : null
        return write(action ? ORDER_ACTIONS[action]! : "orders.edit")
    }
    // Trabalhos (M4).
    const work = new RegExp(`^works(?:/(${ID})(?:/(move|payment|unpay|archive|restore|notes|attachments|time-entries)(?:/${ID})?)?)?$`, "i").exec(tail)
    if (work) {
        const action = work[2]
        if (action && WORK_ACTIONS[action]) return write(WORK_ACTIONS[action])
        return write(!action && method === "DELETE" ? "works.delete" : "works.edit")
    }
    if (/^work-columns(?:\/(?:order|col-[a-z0-9]{6,24}))?$/i.test(tail)) return write("works.columns")
    // Portfólio (M5).
    // Editor: rascunho, modelo, histórico e mídia com a edição; publicar, endereço e indexação (PATCH) com a publicação.
    const portfolio = new RegExp(`^portfolio(?:/(publish|unpublish|slug|preview|draft|publish-changes|discard-draft|template|history(?:/\\d+/restore)?|media(?:/${ID})?))?$`, "i").exec(tail)
    if (portfolio) {
        const action = portfolio[1]
        if (!action) return write("portfolio.publish")
        return write(["publish", "unpublish", "slug", "publish-changes"].includes(action) ? "portfolio.publish" : "portfolio.edit")
    }
    return null
}
