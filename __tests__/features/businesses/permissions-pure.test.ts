import { describe, expect, it } from "vitest"
import { catalog, normalizeRolePermissions } from "@/features/access/catalog"
import { routePermissions } from "@/features/access/server/policy"
import { BUSINESS_FULL_PERMISSIONS, businessPermissionRequiredBy, businessRouteAccess, canModule, canReadModule, expandBusinessPermissions, moduleOfSection } from "@/features/businesses/permissions"
import { businessSpaceNavSection } from "@/features/businesses/components/space/space-nav"
import { OPEX_TOOL_CATALOG } from "@/features/opex-agent/tool-catalog"

const canOf = (keys: string[]) => {
    const set = new Set(normalizeRolePermissions(keys))
    return (key: string) => set.has("*") || set.has(key)
}

describe("catálogo dos Negócios", () => {
    it("um subgrupo por módulo, com a visualização como viewKey; sensíveis nas ações de risco", () => {
        for (const key of BUSINESS_FULL_PERMISSIONS) expect(catalog.isKnownKey(key)).toBe(true)
        expect(catalog.isKnownKey("businesses.view_all")).toBe(true)
        expect(catalog.requiredViewFor("orders.send")).toBe("orders.view")
        expect(catalog.requiredViewFor("works.payment")).toBe("works.view")
        expect(catalog.requiredViewFor("businesses.delete")).toBe("businesses.use")
        // O suporte não ganha `businesses.use` (não força a entrevista).
        expect(catalog.requiredViewFor("businesses.view_all")).toBeUndefined()
        expect(catalog.getSensitiveKeys(BUSINESS_FULL_PERMISSIONS).sort()).toEqual(
            ["activities.delete", "businesses.delete", "clients.delete", "documents.delete", "goals.delete", "orders.send", "portfolio.publish", "successes.delete", "works.delete", "works.payment"].sort(),
        )
    })

    it("dependências entre grupos: Pedidos vê Clientes e Atividades; decidir vê Trabalhos; Trabalhos vê Pedidos", () => {
        expect(new Set(normalizeRolePermissions(["orders.view"]))).toEqual(new Set(["orders.view", "businesses.use", "clients.view", "activities.view"]))
        expect(new Set(normalizeRolePermissions(["orders.decide"]))).toEqual(new Set(["orders.decide", "orders.view", "businesses.use", "works.view", "clients.view", "activities.view"]))
        expect(new Set(normalizeRolePermissions(["portfolio.publish"]))).toEqual(new Set(["portfolio.publish", "portfolio.view", "businesses.use"]))
        expect(normalizeRolePermissions(["*"])).toEqual(["*"])
        expect(expandBusinessPermissions(["businesses.view_all"])).toEqual(["businesses.view_all"])
        expect(businessPermissionRequiredBy("clients.view", new Set(["orders.view", "clients.view"]))).toEqual(["orders.view"])
        expect(businessPermissionRequiredBy("orders.view", new Set(["orders.view"]))).toEqual([])
    })
})

describe("telas do prestador", () => {
    it("regressão: perfil sem o painel abre /clientes, /pedidos e /trabalhos com a visualização do módulo", () => {
        const free = canOf(["businesses.use", "clients.view", "orders.view", "works.view"])
        for (const path of ["/clientes", "/clientes/abc", "/pedidos", "/trabalhos", "/negocios", `/negocios/${"a".repeat(24)}`]) expect(businessRouteAccess(path)?.(free), path).toBe(true)
        const onlyBase = canOf(["businesses.use"])
        for (const path of ["/clientes", "/pedidos", "/trabalhos", `/negocios/${"a".repeat(24)}/portfolio`]) expect(businessRouteAccess(path)?.(onlyBase), path).toBe(false)
        expect(businessRouteAccess("/negocios")?.(onlyBase)).toBe(true)
        expect(businessRouteAccess("/negocios/novo")?.(onlyBase)).toBe(false)
        expect(businessRouteAccess("/negocios/novo")?.(canOf(["businesses.create"]))).toBe(true)
        expect(businessRouteAccess("/usuarios")).toBeNull()
        // Suporte lê todos os módulos.
        const support = canOf(["businesses.view_all"])
        for (const path of ["/clientes", "/pedidos", "/trabalhos", `/negocios/${"a".repeat(24)}/metas`]) expect(businessRouteAccess(path)?.(support), path).toBe(true)
    })

    it("a barra do espaço mostra só os módulos visíveis; ações exigem a base", () => {
        const can = canOf(["activities.view", "portfolio.view"])
        expect(businessSpaceNavSection("x", can).items.map((item) => item.href)).toEqual(["", "/ficha", "/atividades", "/portfolio"].map((slug) => `/negocios/x${slug}`))
        expect(canReadModule(can, "orders")).toBe(false)
        expect(canModule(can, "portfolio", "publish")).toBe(false)
        expect(canModule(canOf(["portfolio.publish"]), "portfolio", "publish")).toBe(true)
        expect(moduleOfSection("works.columns")).toBe("works")
        expect(moduleOfSection("portfolio-items")).toBe("portfolio")
        expect(moduleOfSection("ficha")).toBeNull()
    })
})

describe("rotas e ferramentas", () => {
    it("cada escrita exige a base e a chave do módulo; leitura confere no serviço", () => {
        const id = "a".repeat(24)
        expect(routePermissions(`/api/businesses/${id}/archive`, "POST")).toEqual(["businesses.use", "businesses.archive"])
        expect(routePermissions(`/api/businesses/${id}/portfolio-items/${id}`, "DELETE")).toEqual(["businesses.use", "portfolio.edit"])
        expect(routePermissions(`/api/businesses/${id}/orders`, "POST")).toEqual(["businesses.use", "orders.edit"])
        expect(routePermissions(`/api/businesses/${id}/orders/${id}/regenerate-title`, "POST")).toEqual(["businesses.use", "orders.edit"])
        expect(routePermissions(`/api/businesses/${id}/files`, "POST")).toEqual(["businesses.use"])
        expect(routePermissions("/api/orders", "GET")).toEqual([])
        expect(() => routePermissions("/api/orders", "POST")).toThrow()
    })

    it("toda ferramenta de negócio usa uma chave conhecida; leitura aceita o suporte; escrita nunca", () => {
        const business = OPEX_TOOL_CATALOG.filter((tool) => JSON.stringify(tool.access).includes("businesses") || JSON.stringify(tool.access).match(/(activities|goals|documents|successes|clients|orders|works|portfolio)\./))
        expect(business.length).toBeGreaterThan(80)
        for (const tool of business) {
            for (const key of [...(tool.access.all ?? []), ...(tool.access.any ?? [])]) expect(catalog.isKnownKey(key), `${tool.name}: ${key}`).toBe(true)
            if (tool.risk === "read") expect(tool.access.any, tool.name).toContain("businesses.view_all")
            else expect(tool.access.all?.[0], tool.name).toBe("businesses.use")
        }
        const access = (name: string) => OPEX_TOOL_CATALOG.find((tool) => tool.name === name)!.access
        expect(access("send_order")).toEqual({ all: ["businesses.use", "orders.send"] })
        expect(access("mark_work_paid")).toEqual({ all: ["businesses.use", "works.payment"] })
        expect(access("publish_portfolio")).toEqual({ all: ["businesses.use", "portfolio.publish"] })
        expect(access("convert_work_to_success")).toEqual({ all: ["businesses.use", "works.edit", "successes.edit"] })
        expect(access("list_clients")).toEqual({ any: ["clients.view", "businesses.view_all"] })
    })
})
