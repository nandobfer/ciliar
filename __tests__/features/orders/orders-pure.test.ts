import { describe, expect, it } from "vitest"
import { requiresPanel, routePermissions } from "@/features/access/server/policy"
import { orderCode } from "@/features/orders/constants"
import { describeOrderChange } from "@/features/orders/history"
import {
    addDaysToKey,
    allowedOrderActions,
    canOrderTransition,
    deadlineAlert,
    deadlineAlertLabel,
    diffOrderSnapshots,
    displayOrderTitle,
    firstLine,
    formatMinutes,
    itemSubtotalCents,
    nextOrderStatus,
    parseHoursInput,
    quoteExpired,
    suggestedTotalCents,
    type OrderSnapshot,
} from "@/features/orders/logic"
import { clientCreateSchema, orderCreateSchema, quoteAcceptSchema } from "@/features/orders/schemas"
import { parseOrderTitle } from "@/features/orders/server/ai"
import { hashQuoteToken, isQuoteTokenShape } from "@/features/orders/server/link"
import { BUSINESS_SPACE_SECTIONS } from "@/features/businesses/constants"
import { businessSpaceNavSection } from "@/features/businesses/components/space/space-nav"

/** Regras puras de Clientes e Pedidos (M3). */

const snapshot = (patch: Partial<OrderSnapshot> = {}): OrderSnapshot => ({
    title: "Site institucional",
    description: "Preciso de um site",
    currency: "BRL",
    items: [{ activityName: "Design", minutes: 120, hourlyRateCents: 10000 }],
    totalCents: 20000,
    totalManual: false,
    dueDate: "2026-11-10",
    attachments: [],
    ...patch,
})

describe("valores e horas", () => {
    it("subtotal = horas × valor/hora (arredondado) e total sugerido", () => {
        expect(itemSubtotalCents(90, 10000)).toBe(15000)
        expect(itemSubtotalCents(1, 10000)).toBe(167)
        expect(suggestedTotalCents([{ minutes: 60, hourlyRateCents: 5000 }, { minutes: 30, hourlyRateCents: 8000 }])).toBe(9000)
    })

    it("horas no formato h:mm", () => {
        expect(formatMinutes(90)).toBe("1:30")
        expect(formatMinutes(0)).toBe("0:00")
        expect(parseHoursInput("2:05")).toBe(125)
        expect(parseHoursInput("3")).toBe(180)
        expect(parseHoursInput("1:75")).toBeNull()
        expect(parseHoursInput("abc")).toBeNull()
        expect(parseHoursInput("")).toBeNull()
    })

    it("código sequencial por negócio", () => {
        expect(orderCode(1)).toBe("PED-0001")
        expect(orderCode(12345)).toBe("PED-12345")
    })
})

describe("estados", () => {
    it("rascunho → enviado → aceito/recusado; recusado reabre; rascunho/enviado cancelam", () => {
        expect(allowedOrderActions("draft")).toEqual(["edit", "send", "cancel"])
        expect(allowedOrderActions("sent")).toEqual(["edit", "send", "revoke", "accept", "reject", "cancel"])
        expect(allowedOrderActions("rejected")).toEqual(["reopen"])
        expect(allowedOrderActions("accepted")).toEqual([])
        expect(allowedOrderActions("cancelled")).toEqual([])
        expect(canOrderTransition("draft", "accept")).toBe(false)
        expect(nextOrderStatus("sent", "revoke")).toBe("draft")
        expect(nextOrderStatus("rejected", "reopen")).toBe("draft")
        expect(nextOrderStatus("draft", "cancel")).toBe("cancelled")
    })
})

describe("versões", () => {
    it("diferenças: título, itens (incluído, alterado, removido), total, prazo e anexos", () => {
        const before = snapshot({ attachments: [{ id: "a", name: "briefing.pdf" }] })
        const after = snapshot({
            title: "Site novo",
            items: [
                { activityName: "Design", minutes: 180, hourlyRateCents: 10000 },
                { activityName: "Programação", minutes: 60, hourlyRateCents: 15000 },
            ],
            totalCents: 45000,
            dueDate: "2026-11-20",
            attachments: [{ id: "b", name: "logo.png" }],
        })
        const changes = diffOrderSnapshots(before, after)
        expect(changes.map((change) => change.field)).toEqual(["title", "item", "item", "totalCents", "dueDate", "attachment", "attachment"])
        expect(changes.map((change) => describeOrderChange(change, "BRL"))).toEqual([
            "Título: “Site institucional” → “Site novo”",
            "Design: 2:00 h → 3:00 h",
            expect.stringContaining("Item incluído: Programação (1:00 h"),
            expect.stringMatching(/^Valor total: R\$\s200,00 → R\$\s450,00$/),
            "Entrega: 10/11/2026 → 20/11/2026",
            "Anexo incluído: logo.png",
            "Anexo removido: briefing.pdf",
        ])
        expect(diffOrderSnapshots(null, after)).toEqual([])
        expect(diffOrderSnapshots(after, snapshot({ items: [] })).some((change) => change.field === "item" && change.kind === "removed")).toBe(true)
    })
})

describe("prazos e validade", () => {
    it("alerta: vence em X dias dentro da antecedência; atrasado depois da entrega", () => {
        expect(deadlineAlert("2026-10-24", "2026-10-21", 3)).toEqual({ kind: "soon", days: 3 })
        expect(deadlineAlert("2026-10-25", "2026-10-21", 3)).toBeNull()
        expect(deadlineAlert("2026-10-20", "2026-10-21", 3)).toEqual({ kind: "overdue", days: 1 })
        expect(deadlineAlert(null, "2026-10-21", 3)).toBeNull()
        expect(deadlineAlertLabel({ kind: "soon", days: 0 })).toBe("Vence hoje")
        expect(deadlineAlertLabel({ kind: "soon", days: 2 })).toBe("Vence em 2 dias")
        expect(deadlineAlertLabel({ kind: "overdue", days: 4 })).toBe("Atrasado")
    })

    it("link válido até o fim do dia; padrão de validade por soma de dias", () => {
        expect(quoteExpired("2026-10-21", "2026-10-21")).toBe(false)
        expect(quoteExpired("2026-10-21", "2026-10-22")).toBe(true)
        expect(addDaysToKey("2026-10-21", 15)).toBe("2026-11-05")
        expect(addDaysToKey("2026-12-25", 10)).toBe("2027-01-04")
    })
})

describe("título exibido e IA", () => {
    it("até a IA gerar, a primeira linha da descrição", () => {
        expect(firstLine("\n  Preciso de um site\nCom blog")).toBe("Preciso de um site")
        expect(displayOrderTitle({ title: null, description: "Logo nova\nDetalhes" })).toBe("Logo nova")
        expect(displayOrderTitle({ title: "Identidade visual", description: "Logo nova" })).toBe("Identidade visual")
        expect(firstLine("x".repeat(200)).length).toBe(120)
    })

    it("lê o JSON da IA (com cercas ou texto em volta); inválido = null", () => {
        expect(parseOrderTitle('```json\n{"title":"Site institucional","summary":"Site com 5 páginas"}\n```')).toEqual({ title: "Site institucional", summary: "Site com 5 páginas" })
        expect(parseOrderTitle('Aqui: {"title":"  A  ","summary":null}')).toEqual({ title: "A", summary: null })
        expect(parseOrderTitle("sem json")).toBeNull()
    })
})

describe("entradas, token e rotas", () => {
    it("pedido exige um cliente (existente OU novo) e a descrição; aceite exige o nome", () => {
        expect(orderCreateSchema.safeParse({ description: "x" }).success).toBe(false)
        expect(orderCreateSchema.safeParse({ clientId: "a".repeat(24), newClient: { name: "Ana" }, description: "x" }).success).toBe(false)
        expect(orderCreateSchema.safeParse({ newClient: { name: "Ana" }, description: "x" }).success).toBe(true)
        expect(orderCreateSchema.safeParse({ clientId: "a".repeat(24), description: "  " }).success).toBe(false)
        expect(orderCreateSchema.safeParse({ clientId: "a".repeat(24), description: "x", items: [{ minutes: 60 }] }).success).toBe(false)
        expect(orderCreateSchema.safeParse({ clientId: "a".repeat(24), description: "x", dueDate: "2026-02-31" }).success).toBe(false)
        expect(clientCreateSchema.safeParse({ name: "Ana", email: "invalido" }).success).toBe(false)
        expect(clientCreateSchema.safeParse({ name: "Ana", email: "" }).success).toBe(true)
        expect(quoteAcceptSchema.safeParse({ name: " " }).success).toBe(false)
    })

    it("token com prefixo e formato; hash estável", () => {
        expect(isQuoteTokenShape(`ped_${"A".repeat(32)}`)).toBe(true)
        expect(isQuoteTokenShape("ped_../../etc")).toBe(false)
        expect(isQuoteTokenShape("cli_abc")).toBe(false)
        expect(hashQuoteToken("ped_x")).toHaveLength(64)
    })

    it("rotas: prestador sem painel; leitura confere no serviço; alteração exige a chave do módulo", () => {
        for (const path of ["/api/clients", "/api/orders", `/api/businesses/${"a".repeat(24)}/orders`]) expect(requiresPanel(path)).toBe(false)
        const order = `/api/businesses/${"a".repeat(24)}/orders/${"b".repeat(24)}`
        expect(routePermissions(order, "GET")).toEqual([])
        expect(routePermissions(order, "PATCH")).toEqual(["businesses.use", "orders.edit"])
        expect(routePermissions(`${order}/send`, "POST")).toEqual(["businesses.use", "orders.send"])
        expect(routePermissions(`${order}/revoke`, "POST")).toEqual(["businesses.use", "orders.send"])
        for (const action of ["accept", "reject", "reopen", "cancel"]) expect(routePermissions(`${order}/${action}`, "POST")).toEqual(["businesses.use", "orders.decide"])
        expect(routePermissions(`${order}/link`, "GET")).toEqual([])
        expect(routePermissions(`${order}/versions/1`, "GET")).toEqual([])
        expect(routePermissions(`/api/clients/${"c".repeat(24)}/archive`, "POST")).toEqual(["businesses.use", "clients.edit"])
        expect(routePermissions(`/api/clients/${"c".repeat(24)}`, "DELETE")).toEqual(["businesses.use", "clients.delete"])
        expect(routePermissions("/api/clients", "GET")).toEqual([])
        expect(routePermissions("/api/ai/features/order-title", "PUT")).toEqual(["integrations.ai.edit"])
        expect(() => routePermissions(`${order}/destroy`, "POST")).toThrow()
    })

    it("o espaço do negócio ganha Pedidos (M3) e Trabalhos (M4) na barra lateral", () => {
        expect(BUSINESS_SPACE_SECTIONS.map((section) => section.slug)).toContain("pedidos")
        expect(businessSpaceNavSection("abc").items.slice(-3, -1)).toEqual([expect.objectContaining({ href: "/negocios/abc/pedidos", label: "Pedidos" }), expect.objectContaining({ href: "/negocios/abc/trabalhos", label: "Trabalhos" })])
    })
})
