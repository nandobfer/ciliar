// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

vi.mock("framer-motion", () => ({
    useReducedMotion: () => true,
    motion: { span: ({ children, layoutId: _layoutId, transition: _transition, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span> },
}))

import { WorkCardView } from "@/features/works/components/WorkCard"
import { HoursProgress } from "@/features/works/components/WorkBadges"
import { WorkViewSwitch } from "@/features/works/components/WorkViewSwitch"
import type { WorkSummaryDto } from "@/features/works/types"

const work = (patch: Partial<WorkSummaryDto> = {}): WorkSummaryDto => ({
    id: "w1",
    businessId: "b1",
    businessName: "Studio",
    orderId: "o1",
    code: "PED-0007",
    title: "Identidade visual",
    clientId: "c1",
    clientName: "Maria",
    column: "execution",
    columnName: "Execução",
    position: 1,
    estimatedMinutes: 120,
    loggedMinutes: 90,
    totalCents: 15000,
    currency: "BRL",
    dueDate: "2000-01-01",
    deadlineAlertDays: 3,
    payment: null,
    status: "active",
    archivedAt: null,
    purgeAt: null,
    successId: null,
    version: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...patch,
})
afterEach(cleanup)

describe("card do Kanban", () => {
    it("mostra código + título, cliente, valor, alerta de prazo e horas estimadas × apontadas", () => {
        const onOpen = vi.fn()
        render(<WorkCardView work={work()} onOpen={onOpen} />)
        expect(screen.getByText("PED-0007")).toBeTruthy()
        expect(screen.getByText("Identidade visual")).toBeTruthy()
        expect(screen.getByText("Maria")).toBeTruthy()
        expect(screen.getByText(/R\$\s?150,00/)).toBeTruthy()
        expect(screen.getByText("Atrasado")).toBeTruthy()
        expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("75")
        expect(screen.queryByText("Studio")).toBeNull()
        fireEvent.click(screen.getByRole("button", { name: /Abrir PED-0007/ }))
        expect(onOpen).toHaveBeenCalled()
    })
    it("visão geral: negócio e o nome da coluna customizada; Pago sem alerta e com a data do pagamento", () => {
        const view = render(<WorkCardView work={work({ column: "col-abc123", columnName: "Aguardando cliente" })} overview />)
        expect(screen.getByText("Studio")).toBeTruthy()
        expect(screen.getByText("Aguardando cliente")).toBeTruthy()
        view.rerender(<WorkCardView work={work({ column: "paid", columnName: "Pago", payment: { paidOn: "2026-03-10", receivedCents: 15000, method: "PIX", at: "2026-03-10T12:00:00Z" } })} />)
        expect(screen.queryByText("Atrasado")).toBeNull()
        expect(screen.getByText("10/03/2026")).toBeTruthy()
    })
    it("horas acima da estimativa ficam em alerta e o switch alterna Kanban | Tabela", () => {
        render(<HoursProgress estimatedMinutes={60} loggedMinutes={90} />)
        expect(screen.getByText("150%")).toBeTruthy()
        const onChange = vi.fn()
        render(<WorkViewSwitch value="kanban" onChange={onChange} />)
        fireEvent.click(screen.getByRole("radio", { name: /Tabela/ }))
        expect(onChange).toHaveBeenCalledWith("table")
    })
})
