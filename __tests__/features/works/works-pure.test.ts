import { describe, expect, it } from "vitest"
import { boardColumnOf, buildBoardColumns, isValidWorkLayout, mergeVisibleOrder, normalizeWorkLayout, overviewColumns, placeColumnAfter, shiftColumn } from "@/features/works/board"
import { finalDropPosition, moveBetweenColumns } from "@/features/works/drop-target"
import { computeDropOrderInList, countsAsRevenue, hoursProgress, measureRevenue, moveFlowOf, paymentMethodOptions, sortWorks, timeEntryValueCents, workDeadlineAlert } from "@/features/works/logic"
import { timeEntryCreateSchema, workColumnCreateSchema, workPaymentSchema, workUnpaySchema } from "@/features/works/schemas"
import { requiresPanel, routePermissions } from "@/features/access/server/policy"

describe("quadro: colunas fixas e customizadas", () => {
    it("normaliza: Abertura primeiro, Pago por último, fixas na ordem e customizadas no trecho em que estavam", () => {
        expect(normalizeWorkLayout([], [])).toEqual(["opening", "execution", "validation", "paid"])
        expect(normalizeWorkLayout(["col-a", "opening", "execution", "col-b", "validation", "paid", "col-c"], ["col-a", "col-b", "col-c"])).toEqual(["opening", "col-a", "execution", "col-b", "validation", "col-c", "paid"])
        // Desconhecidas/repetidas saem; customizadas que faltam entram antes de Pago.
        expect(normalizeWorkLayout(["opening", "col-x", "col-a", "col-a", "execution", "validation", "paid"], ["col-a", "col-new"])).toEqual(["opening", "col-a", "execution", "validation", "col-new", "paid"])
        // Validação antes de Execução na ordem salva: as fixas voltam à ordem.
        expect(normalizeWorkLayout(["opening", "validation", "col-a", "execution", "paid"], ["col-a"])).toEqual(["opening", "execution", "validation", "col-a", "paid"])
    })
    it("valida a reordenação e nunca deixa customizada antes de Abertura nem depois de Pago", () => {
        expect(isValidWorkLayout(["opening", "col-a", "execution", "validation", "paid"], ["col-a"])).toBe(true)
        expect(isValidWorkLayout(["col-a", "opening", "execution", "validation", "paid"], ["col-a"])).toBe(false)
        expect(isValidWorkLayout(["opening", "execution", "validation", "paid", "col-a"], ["col-a"])).toBe(false)
        expect(isValidWorkLayout(["opening", "validation", "execution", "col-a", "paid"], ["col-a"])).toBe(false)
        expect(placeColumnAfter(["opening", "execution", "validation", "paid"], "col-a", "paid")).toEqual(["opening", "execution", "validation", "col-a", "paid"])
        expect(placeColumnAfter(["opening", "execution", "validation", "paid"], "col-a", "opening")).toEqual(["opening", "col-a", "execution", "validation", "paid"])
        expect(shiftColumn(["opening", "col-a", "execution", "validation", "paid"], "col-a", -1)).toBeNull()
        expect(shiftColumn(["opening", "col-a", "execution", "validation", "paid"], "col-a", 1)).toEqual(["opening", "execution", "col-a", "validation", "paid"])
        expect(shiftColumn(["opening", "execution", "validation", "col-a", "paid"], "col-a", 1)).toBeNull()
        expect(shiftColumn(["opening", "execution", "validation", "paid"], "execution", 1)).toBeNull()
        expect(mergeVisibleOrder(["opening", "col-a", "execution", "col-b", "validation", "paid"], ["col-b", "col-a"])).toEqual(["opening", "col-b", "execution", "col-a", "validation", "paid"])
    })
    it("monta as colunas do negócio e a visão geral com \"Outras etapas\"", () => {
        const columns = buildBoardColumns({ columns: [{ key: "col-a", name: "Aguardando", color: "rose", icon: "pause", description: null, fixed: false }], layout: ["opening", "execution", "col-a", "validation", "paid"] })
        expect(columns.map((column) => column.label)).toEqual(["Abertura", "Execução", "Aguardando", "Validação", "Pago"])
        expect(columns[2]!.border).toBe("border-t-rose-400")
        expect(overviewColumns().map((column) => column.label)).toEqual(["Abertura", "Execução", "Validação", "Outras etapas", "Pago"])
        expect(boardColumnOf({ column: "col-a" }, true)).toBe("others")
        expect(boardColumnOf({ column: "col-a" }, false)).toBe("col-a")
        expect(boardColumnOf({ column: "paid" }, true)).toBe("paid")
    })
})

describe("movimentos, ordenação e posição", () => {
    it("Pago exige pagamento ao entrar e confirmação ao sair", () => {
        expect(moveFlowOf("opening", "paid")).toBe("pay")
        expect(moveFlowOf("paid", "execution")).toBe("unpay")
        expect(moveFlowOf("opening", "col-a")).toBe("move")
        expect(moveFlowOf("paid", "paid")).toBe("none")
    })
    it("ordena por posição manual, prazo (sem data no fim) e criação", () => {
        const works = [
            { id: "a", position: 2, createdAt: "2026-01-02T00:00:00Z", dueDate: null },
            { id: "b", position: 1, createdAt: "2026-01-03T00:00:00Z", dueDate: "2026-02-01" },
            { id: "c", position: 3, createdAt: "2026-01-01T00:00:00Z", dueDate: "2026-01-15" },
        ]
        expect(sortWorks(works, "manual").map((work) => work.id)).toEqual(["b", "a", "c"])
        expect(sortWorks(works, "due").map((work) => work.id)).toEqual(["c", "b", "a"])
        expect(sortWorks(works, "newest").map((work) => work.id)).toEqual(["b", "a", "c"])
        expect(sortWorks(works, "oldest").map((work) => work.id)).toEqual(["c", "a", "b"])
    })
    it("posição ao soltar: ponto médio entre os vizinhos e empates resolvidos", () => {
        expect(computeDropOrderInList([1, 3], 1)).toBe(2)
        expect(computeDropOrderInList([1, 3], 0)).toBe(0)
        expect(computeDropOrderInList([1, 3], 2)).toBe(4)
        expect(computeDropOrderInList([5, 5, 7], 1)).toBe(6)
        const items = moveBetweenColumns({ opening: ["a", "b"], execution: ["c"] }, "a", "opening", "execution", "c", false)
        expect(items).toEqual({ opening: ["b"], execution: ["a", "c"] })
        const positions: Record<string, number> = { a: 10, b: 20, c: 30 }
        const result = finalDropPosition(items, { opening: ["a", "b"], execution: ["c"] }, { id: "a" }, "opening", "execution", "c", "manual", (id) => positions[id]!)
        // Solto sobre "c" (já dentro da coluna durante o arraste): fica na posição de "c", como no Opex.
        expect(result).toMatchObject({ items: { opening: ["b"], execution: ["c", "a"] }, position: 31 })
        expect(finalDropPosition({ opening: ["b"], execution: ["c"] }, { opening: ["a", "b"], execution: ["c"] }, { id: "a" }, "opening", "execution", "drop:execution", "manual", (id) => positions[id]!)).toMatchObject({ items: { execution: ["c", "a"] }, position: 31 })
        expect(finalDropPosition({ opening: ["a", "b"] }, { opening: ["a", "b"] }, { id: "a" }, "opening", "opening", "a", "manual", (id) => positions[id]!)).toBeNull()
        expect(finalDropPosition({ opening: ["b", "a"] }, { opening: ["a", "b"] }, { id: "a" }, "opening", "opening", "b", "due", (id) => positions[id]!)).toBeNull()
    })
})

describe("horas, faturamento e prazo", () => {
    it("barra de horas e valor do lançamento", () => {
        expect(hoursProgress(120, 60)).toEqual({ percent: 50, over: false })
        expect(hoursProgress(60, 90)).toEqual({ percent: 150, over: true })
        expect(hoursProgress(0, 30)).toEqual({ percent: null, over: true })
        expect(timeEntryValueCents(90, 10000)).toBe(15000)
    })
    it("faturamento bruto: só pagos ativos, pela data do pagamento; horas apontadas desses trabalhos", () => {
        const works = [
            { status: "active" as const, column: "paid", payment: { paidOn: "2026-03-10", receivedCents: 1000 }, loggedMinutes: 60 },
            { status: "archived" as const, column: "paid", payment: { paidOn: "2026-03-11", receivedCents: 5000 }, loggedMinutes: 30 },
            { status: "active" as const, column: "validation", payment: null, loggedMinutes: 120 },
            { status: "active" as const, column: "paid", payment: { paidOn: "2026-04-01", receivedCents: 700 }, loggedMinutes: 15 },
        ]
        expect(measureRevenue(works, { from: "2026-03-01", to: "2026-03-31" })).toEqual({ revenueCents: 1000, minutes: 60 })
        expect(measureRevenue(works, { from: "2026-01-01", to: "2026-12-31" })).toEqual({ revenueCents: 1700, minutes: 75 })
        expect(countsAsRevenue(works[1]!)).toBe(false)
    })
    it("selo de prazo: Pago não tem alerta", () => {
        expect(workDeadlineAlert({ column: "execution", dueDate: "2026-01-01" }, "2026-01-05", 3)).toEqual({ kind: "overdue", days: 4 })
        expect(workDeadlineAlert({ column: "paid", dueDate: "2026-01-01" }, "2026-01-05", 3)).toBeNull()
        expect(workDeadlineAlert({ column: "opening", dueDate: "2026-01-07" }, "2026-01-05", 3)).toEqual({ kind: "soon", days: 2 })
    })
    it("formas de pagamento: usadas primeiro, padrão depois, sem repetir", () => {
        expect(paymentMethodOptions(["Pix", "Boleto bancário"], ["PIX", "Transferência"])).toEqual(["Pix", "Boleto bancário", "Transferência"])
    })
})

describe("entradas e rotas", () => {
    it("valida coluna, pagamento, saída de Pago e lançamento de horas", () => {
        expect(workColumnCreateSchema.parse({ name: " Aguardando ", color: "rose", icon: "pause" })).toMatchObject({ name: "Aguardando", description: "" })
        expect(workColumnCreateSchema.safeParse({ name: "", color: "rose", icon: "pause" }).success).toBe(false)
        expect(workPaymentSchema.safeParse({ paidOn: "2026-02-30", receivedCents: 100, version: 0 }).success).toBe(false)
        expect(workPaymentSchema.safeParse({ paidOn: "2026-02-28", receivedCents: -1, version: 0 }).success).toBe(false)
        expect(workUnpaySchema.safeParse({ column: "execution", version: 0 }).success).toBe(false)
        expect(workUnpaySchema.safeParse({ column: "execution", confirm: true, version: 0 }).success).toBe(true)
        expect(timeEntryCreateSchema.safeParse({ source: "orderItem", refId: "x", date: "2026-01-01", minutes: 0 }).success).toBe(false)
        expect(timeEntryCreateSchema.safeParse({ source: "orderItem", refId: "x", date: "2026-01-01", minutes: 24 * 60 + 1 }).success).toBe(false)
        expect(timeEntryCreateSchema.safeParse({ source: "activity", refId: "x", date: "2026-01-01", minutes: 90, description: "Revisão" }).success).toBe(true)
    })
    it("APIs dos trabalhos não exigem o painel; escrita exige businesses.use", () => {
        const id = "a".repeat(24)
        expect(requiresPanel("/api/works")).toBe(false)
        expect(requiresPanel(`/api/businesses/${id}/works/${id}/payment`)).toBe(false)
        expect(routePermissions("/api/works", "GET")).toEqual([])
        expect(routePermissions(`/api/businesses/${id}/works`, "GET")).toEqual([])
        expect(routePermissions(`/api/businesses/${id}/works/${id}/move`, "POST")).toEqual(["businesses.use"])
        expect(routePermissions(`/api/businesses/${id}/works/${id}/time-entries/${id}`, "PATCH")).toEqual(["businesses.use"])
        expect(routePermissions(`/api/businesses/${id}/work-columns/col-abc123def456`, "DELETE")).toEqual(["businesses.use"])
        expect(routePermissions(`/api/businesses/${id}/work-columns/order`, "PUT")).toEqual(["businesses.use"])
        expect(() => routePermissions(`/api/businesses/${id}/works/${id}/unknown`, "POST")).toThrow()
    })
})
