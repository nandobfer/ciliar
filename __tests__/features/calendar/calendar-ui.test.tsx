// @vitest-environment jsdom
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { DndContext } from "@dnd-kit/core"

import { DeadlineConflictAlert } from "@/features/calendar/components/DeadlineConflictAlert"
import { MonthView } from "@/features/calendar/components/MonthView"
import { TimeGridView } from "@/features/calendar/components/TimeGridView"
import { CalendarViewSwitch, periodLabel } from "@/features/calendar/components/CalendarPage"
import { initialOrderBusiness } from "@/features/calendar/components/NewOrderDialog"
import { HOUR_HEIGHT } from "@/features/calendar/components/calendar-layout"
import type { CalendarEventDto, DeadlineConflictDto } from "@/features/calendar/types"

afterEach(cleanup)

const wrap = (children: ReactNode) => (
    <QueryClientProvider client={new QueryClient()}>
        <DndContext>{children}</DndContext>
    </QueryClientProvider>
)

const event = (patch: Partial<CalendarEventDto>): CalendarEventDto => ({
    id: Math.random().toString(36),
    kind: "work-deadline",
    businessId: "b1",
    businessName: "Studio",
    color: "#AA0000",
    title: "Site",
    subtitle: null,
    allDay: true,
    start: "2026-11-04",
    end: "2026-11-04",
    workId: "w1",
    orderId: "o1",
    code: "PED-0001",
    statusLabel: "Execução",
    orderStatus: null,
    column: "execution",
    deadlineLabel: null,
    deadlineOverdue: false,
    conflict: null,
    draggable: true,
    version: 0,
    minutes: null,
    details: null,
    google: null,
    googleLink: null,
    ...patch,
})

const conflict = (patch: Partial<DeadlineConflictDto>): DeadlineConflictDto => ({ level: "none", dueDate: "2026-11-06", overlap: [], overlapCount: patch.overlap?.length ?? 0, capacity: null, businessNames: { b1: "Studio" }, googleError: null, ...patch })

describe("alerta de conflito", () => {
    it("forte mostra necessárias × livres; informativo lista os trabalhos; nunca bloqueia", () => {
        const { rerender, container } = render(
            <DeadlineConflictAlert
                conflict={conflict({
                    level: "strong",
                    capacity: { requiredMinutes: 600, availableMinutes: 540, worksMinutes: 120, busyMinutes: 60, occupiedMinutes: 180, freeMinutes: 360, noAvailability: false, insufficient: true },
                    overlap: [{ id: "w9", businessId: "b1", code: "PED-0009", title: "Logo", startKey: "2026-11-01", dueDate: "2026-11-05" }],
                })}
            />,
        )
        expect(screen.getByText(/Capacidade insuficiente: 10:00 necessárias × 6:00 livres/)).toBeTruthy()
        expect(screen.getByText(/PED-0009 · Logo \(Studio, 01\/11\/2026 a 05\/11\/2026\)/)).toBeTruthy()
        expect(screen.getByText(/nada é bloqueado/)).toBeTruthy()
        expect(container.querySelector('[data-conflict="strong"]')).toBeTruthy()

        rerender(<DeadlineConflictAlert conflict={conflict({ level: "strong", capacity: { requiredMinutes: 60, availableMinutes: 0, worksMinutes: 0, busyMinutes: 0, occupiedMinutes: 0, freeMinutes: 0, noAvailability: true, insufficient: true } })} />)
        expect(screen.getByText(/expediente não está configurado/)).toBeTruthy()

        cleanup()
        render(<DeadlineConflictAlert conflict={conflict({ level: "none" })} />)
        expect(screen.queryByRole("status")).toBeNull()
    })
})

describe("visões Semana/Dia", () => {
    it("linha tracejada segue o ponteiro e destaca o horário à esquerda; expediente sombreado; clique no horário cria o pedido do dia", () => {
        const onCreate = vi.fn()
        const windows = new Map<string, [number, number][]>([["2026-11-04", [[9 * 60, 18 * 60]]]])
        render(wrap(<TimeGridView days={["2026-11-04"]} today="2000-01-01" timeZone="America/Sao_Paulo" events={[event({}), event({ kind: "google", allDay: false, start: "2026-11-04T13:00:00.000Z", end: "2026-11-04T14:00:00.000Z", title: "Reunião", code: null, draggable: false })]} conflicts={{ "2026-11-04": "strong" }} windows={windows} shadeOff canCreate onCreate={onCreate} />))
        const grid = screen.getByTestId("calendar-hours")
        expect(screen.queryByTestId("pointer-line")).toBeNull()
        fireEvent.mouseMove(grid, { clientY: HOUR_HEIGHT * 9 + 13 })
        expect(screen.getByTestId("pointer-line")).toBeTruthy()
        expect(screen.getByTestId("pointer-label").textContent).toBe("09:15")
        fireEvent.mouseLeave(grid)
        expect(screen.queryByTestId("pointer-line")).toBeNull()
        expect(screen.getAllByTestId("off-hours")).toHaveLength(2)
        expect(screen.getByRole("button", { name: /Google Agenda: \d\d:\d\d Reunião/ })).toBeTruthy()
        expect(screen.getByLabelText("Conflito de capacidade")).toBeTruthy()
        fireEvent.click(grid.querySelector('[data-date="2026-11-04"]')!)
        expect(onCreate).toHaveBeenCalledWith("2026-11-04")
    })
})

describe("visão Mês", () => {
    it("mostra até 3 eventos por dia e o resto em +N; o + do dia cria o pedido com o prazo", () => {
        const onCreate = vi.fn()
        const events = Array.from({ length: 5 }, (_, index) => event({ id: `e${index}`, title: `Trabalho ${index}` }))
        render(wrap(<MonthView from="2026-11-01" to="2026-12-05" anchor="2026-11-15" today="2026-11-04" timeZone="America/Sao_Paulo" events={events} conflicts={{}} offDays={new Set(["2026-11-08"])} canCreate onCreate={onCreate} />))
        expect(screen.getAllByRole("button", { name: /Prazo do trabalho: PED-0001 · Trabalho/ })).toHaveLength(3)
        expect(screen.getByRole("button", { name: "+2" })).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Novo pedido com prazo em 04/11/2026" }))
        expect(onCreate).toHaveBeenCalledWith("2026-11-04")
    })
})

describe("barra do calendário", () => {
    it("Dia | Semana | Mês e o título do período", () => {
        const onChange = vi.fn()
        render(<CalendarViewSwitch value="week" onChange={onChange} />)
        fireEvent.click(screen.getByRole("radio", { name: "Mês" }))
        expect(onChange).toHaveBeenCalledWith("month")
        expect(periodLabel("month", "2026-11-15", "2026-11-01", "2026-12-05")).toBe("novembro de 2026")
        expect(periodLabel("week", "2026-11-04", "2026-11-01", "2026-11-07")).toBe("1 – 7 de nov de 2026")
    })
})

describe("novo pedido pelo calendário", () => {
    it("pré-seleciona o negócio da aba, o filtrado na página global (se aceitar pedidos) ou o único que aceita", () => {
        const creatable = [{ id: "a" }, { id: "b" }]
        expect(initialOrderBusiness(creatable, "x", "a")).toBe("x")
        expect(initialOrderBusiness(creatable, null, "b")).toBe("b")
        expect(initialOrderBusiness(creatable, null, "z")).toBeNull()
        expect(initialOrderBusiness(creatable, null, null)).toBeNull()
        expect(initialOrderBusiness([{ id: "a" }], null, null)).toBe("a")
    })
})
