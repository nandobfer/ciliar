// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

vi.mock("framer-motion", () => ({
    useReducedMotion: () => true,
    motion: { div: ({ children, initial: _initial, animate: _animate, transition: _transition, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div> },
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
vi.mock("@/lib/api", () => ({ api: { post: vi.fn() }, apiErrorMessage: () => "Erro", unwrapApi: (value: unknown) => value }))

import { PublicQuotePage } from "@/features/orders/components/PublicQuotePage"
import { DeadlineBadge } from "@/features/orders/components/OrderBadges"
import type { PublicQuoteDto } from "@/features/orders/types"

const quote = (state: PublicQuoteDto["state"] = "open"): PublicQuoteDto => ({
    state, code: "PED-0001",
    business: { name: "Studio", description: "Design", links: [], logoUrl: null, contactEmail: "studio@example.test", contactPhone: null, theme: { primaryColor: "#0B57C4", mode: "light" } },
    title: "Identidade visual", description: "Criar uma marca", currency: "BRL", items: [{ activityName: "Design", minutes: 90, hourlyRateCents: 10000, subtotalCents: 15000 }],
    totalCents: 15000, dueDate: "2026-11-10", validUntil: "2026-11-05", attachments: [], history: [{ number: 1, reason: "send", at: "2026-10-21T12:00:00Z", changes: [] }], decision: null,
})
afterEach(cleanup)

describe("orçamento público", () => {
    it("aplica tema do negócio e mostra dados, horas, histórico e aceite com nome obrigatório", () => {
        render(<PublicQuotePage token="test" initial={quote()} error={null} />)
        expect(document.documentElement.classList.contains("dark")).toBe(false)
        expect(screen.getByText("Identidade visual")).toBeTruthy()
        expect(screen.getByText(/1:30 h/)).toBeTruthy()
        expect(screen.getByText(/Versão 1/)).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Aceitar orçamento" }))
        fireEvent.click(screen.getByRole("button", { name: "Confirmar aceite" }))
        expect(screen.getByRole("alert").textContent).toContain("Informe o seu nome")
    })
    it("expirado e indisponível não oferecem decisão; indisponível não mostra itens", () => {
        const view = render(<PublicQuotePage token="test" initial={quote("expired")} error={null} />)
        expect(screen.queryByRole("button", { name: "Aceitar orçamento" })).toBeNull()
        expect(screen.getByRole("status").textContent).toContain("expirado")
        view.rerender(<PublicQuotePage token="other" initial={quote("unavailable")} error={null} key="other" />)
        expect(screen.queryByText("Identidade visual")).toBeNull()
        expect(screen.getByRole("status").textContent).toContain("indisponível")
    })
    it("pedido decidido é somente leitura e mostra a decisão", () => {
        const accepted = { ...quote("accepted"), decision: { kind: "accept" as const, name: "Maria", reason: null, at: "2026-10-21T12:00:00Z" } }
        render(<PublicQuotePage token="test" initial={accepted} error={null} />)
        expect(screen.getByRole("status").textContent).toContain("Maria")
        expect(screen.queryByRole("button", { name: "Aceitar orçamento" })).toBeNull()
    })
    it("alerta de atraso só aparece em pedidos abertos", () => {
        const view = render(<DeadlineBadge status="sent" dueDate="2000-01-01" alertDays={3} />)
        expect(screen.getByText("Atrasado")).toBeTruthy()
        view.rerender(<DeadlineBadge status="accepted" dueDate="2000-01-01" alertDays={3} />)
        expect(screen.queryByText("Atrasado")).toBeNull()
    })
})
