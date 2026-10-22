// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@nandobfer/perfix/react", () => ({ usePermissions: () => ({ can: () => true, canAny: () => true }) }))
const state = vi.hoisted(() => ({ period: "month", setPeriod: vi.fn() }))
const business = vi.hoisted(() => ({
    id: "a".repeat(24),
    number: 1,
    name: "Studio Aurora",
    type: "PJ",
    subtype: null,
    segment: null,
    description: null,
    links: [],
    availability: [],
    currency: "BRL",
    logo: null,
    theme: { primaryColor: "#0B57C4", mode: "dark" },
    contactEmail: null,
    accountEmail: "ana@example.test",
    contactPhone: null,
    deadlineAlertDays: 3,
    quoteValidityDays: 15,
    currencyLocked: false,
    valuedItems: { activities: 0, goals: 0 },
    version: 0,
    own: true,
    editable: true,
    status: "active",
}))
const goal = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    businessId: "a".repeat(24),
    name: null,
    targetCents: 500000,
    period: "month",
    measure: null,
    mode: "recurring",
    month: null,
    year: null,
    from: null,
    to: null,
    status: "active",
    archivedAt: null,
    purgeAt: null,
    version: 0,
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
    activePeriods: [{ from: "2026-10-01T12:00:00.000Z", to: null }],
    supersededAt: null,
    supersededReason: null,
    progress: { status: "active", current: { key: "2026-10", label: "outubro/2026", from: "2026-10-01", to: "2026-10-31", revenueCents: 125000, minutes: 0, achievedCents: 125000, percent: 25, available: true }, history: [] },
    ...extra,
})
const goals = vi.hoisted(() => ({ current: null as unknown, history: [] as unknown[] }))
const goalAction = vi.hoisted(() => vi.fn())
const dashboard = {
    businessId: business.id,
    currency: "BRL",
    timeZone: "America/Sao_Paulo",
    period: "month",
    granularity: "day",
    range: { from: "2026-10-01", to: "2026-10-21" },
    goal: null as unknown,
    visible: { activities: true, goals: true, documents: true, successes: true, revenue: true },
    counts: { activities: 4, goals: 0, documents: 2, successes: 1 },
    kpis: { currentGoalPercent: null, revenueCents: 0, activeActivities: 4, averageRateCents: 15000, documents: 2, successesInPeriod: 0 },
    charts: { activityRates: [], activitiesByCategory: [], documentsByCategory: [], successes: [], rateTrend: { activities: [], rows: [] }, revenue: [], hasRevenue: false },
}
const editable = vi.hoisted(() => ({ value: true }))
const upload = vi.hoisted(() => vi.fn(async () => ({ file: null, error: "Falhou" })))
vi.mock("@/features/businesses/components/space/BusinessSpaceLayout", () => ({ useBusinessSpace: () => ({ business: { ...business, editable: editable.value, actions: { edit: editable.value, archive: editable.value, delete: editable.value } }, editable: editable.value }), businessSubtitle: () => "Pessoa jurídica" }))
vi.mock("@/features/businesses/hooks/useBusinessSpace", () => ({
    useBusinessDashboardPeriod: () => ({ period: state.period, setPeriod: state.setPeriod, ready: true }),
    useBusinessDashboard: () => ({ data: dashboard, isPending: false, isError: false, isFetching: false, refetch: vi.fn() }),
    useUpdateBusiness: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useBusinessLogo: () => ({ set: { mutateAsync: vi.fn(), isPending: false }, remove: { mutate: vi.fn(), isPending: false } }),
    useBusinessUploads: () => ({ items: [], upload, reset: vi.fn(), busy: false }),
    useGoals: () => ({ data: { current: goals.current, history: goals.history, editable: true }, isPending: false, isError: false, refetch: vi.fn() }),
    useGoalAction: () => ({ mutate: goalAction, isPending: false }),
    useSaveItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

import { BusinessDashboardPage } from "@/features/businesses/components/space/BusinessDashboardPage"
import { BusinessProfilePage } from "@/features/businesses/components/space/BusinessProfilePage"
import { GoalsPage } from "@/features/businesses/components/space/GoalsPage"

afterEach(() => {
    cleanup()
    editable.value = true
    upload.mockClear()
    goalAction.mockClear()
    dashboard.goal = null
    goals.current = null
    goals.history = []
})

describe("layout do espaço do negócio", () => {
    it("dashboard: período com Mês atual, indicadores e atalhos numa coluna própria", () => {
        render(<BusinessDashboardPage />)
        // O nome do negócio é o título (não há "Dashboard").
        expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Studio Aurora")
        expect(screen.queryByRole("heading", { name: "Dashboard" })).toBeNull()
        expect(screen.getByText("Pessoa jurídica")).toBeTruthy()
        const period = screen.getByRole("radiogroup", { name: "Período" })
        expect(within(period).getAllByRole("radio").map((option) => option.textContent)).toEqual(["Mês atual", "3 meses", "6 meses", "12 meses"])
        expect(within(period).getByRole("radio", { name: "Mês atual" }).getAttribute("aria-checked")).toBe("true")
        expect(screen.getByText("Valor/hora médio")).toBeTruthy()
        const shortcuts = screen.getByRole("navigation", { name: "Atalhos" })
        expect(within(shortcuts).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["", "/ficha", "/atividades", "/metas", "/documentos", "/sucessos"].filter(Boolean).map((slug) => `/negocios/${business.id}${slug}`))
        // A coluna dos atalhos é irmã do conteúdo principal na grade de duas colunas.
        expect(shortcuts.parentElement?.className).toContain("lg:grid-cols-[minmax(0,1fr)_18rem]")
        expect(screen.getAllByText(/Sem faturamento no período/).length).toBeGreaterThan(0)
    })

    it("ficha: Identificação e Logo/foto na mesma linha", () => {
        render(<BusinessProfilePage />)
        const identification = screen.getByText("Identificação").closest("[class*='h-full']")!
        const logo = screen.getByText("Logo/foto").closest("[class*='h-full']")!
        expect(identification.parentElement).toBe(logo.parentElement)
        expect(identification.parentElement?.className).toContain("lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]")
    })

    it("ficha: nada recebe foco ao abrir; Adicionar link foca o campo novo", () => {
        render(<BusinessProfilePage />)
        expect(document.activeElement).toBe(document.body)
        fireEvent.click(screen.getByRole("button", { name: /Adicionar link/ }))
        expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Link 2" }))
    })

    it("ficha: soltar uma imagem na área da logo envia o arquivo e mostra o erro na própria área", async () => {
        render(<BusinessProfilePage />)
        const zone = screen.getByRole("button", { name: /Solte a imagem aqui ou clique para escolher/ })
        const file = new File(["x"], "logo.png", { type: "image/png" })
        URL.createObjectURL = vi.fn(() => "blob:preview")
        URL.revokeObjectURL = vi.fn()
        fireEvent.dragEnter(zone, { dataTransfer: { files: [file] } })
        expect(zone.getAttribute("data-dragging")).toBe("true")
        fireEvent.drop(zone, { dataTransfer: { files: [file] } })
        expect(upload).toHaveBeenCalledWith(file)
        expect((await screen.findByRole("alert")).textContent).toContain("Falhou")
    })

    it("ficha somente leitura: área da logo desabilitada", () => {
        editable.value = false
        render(<BusinessProfilePage />)
        expect((screen.getByRole("button", { name: /Solte a imagem aqui/ }) as HTMLButtonElement).disabled).toBe(true)
        expect(screen.queryByRole("button", { name: /Remover/ })).toBeNull()
    })

    it("dashboard: a meta atual numa linha inteira (progresso, atingido × alvo e link para Metas)", () => {
        dashboard.goal = goal("g1")
        render(<BusinessDashboardPage />)
        const section = screen.getByRole("region", { name: "Meta atual" })
        expect(within(section).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("25")
        expect(within(section).getByText("Meta mensal")).toBeTruthy()
        expect(within(section).getByText("Falta")).toBeTruthy()
        expect(within(section).getByRole("link", { name: /Ver metas/ }).getAttribute("href")).toBe(`/negocios/${business.id}/metas`)
        expect(screen.queryByText("Progresso das metas ativas")).toBeNull()
    })

    it("metas: a atual em destaque e a linha do tempo; arquivar avisa qual meta volta a valer", () => {
        goals.current = goal("g3", { name: "Atual" })
        goals.history = [
            goal("g2", { name: "Versão anterior", status: "superseded", supersededReason: "edit", supersededAt: "2026-10-10T12:00:00.000Z", activePeriods: [{ from: "2026-10-05T12:00:00.000Z", to: "2026-10-10T12:00:00.000Z" }] }),
            goal("g1", { name: "Antiga", status: "archived", archivedAt: "2026-10-04T12:00:00.000Z", activePeriods: [{ from: "2026-10-01T12:00:00.000Z", to: "2026-10-04T12:00:00.000Z" }] }),
        ]
        render(<GoalsPage />)
        expect(screen.queryByRole("searchbox")).toBeNull()
        const timeline = screen.getByRole("navigation", { name: "Linha do tempo" })
        const entries = within(timeline).getAllByRole("listitem")
        expect(entries.map((entry) => entry.textContent)).toEqual([expect.stringContaining("Atual"), expect.stringContaining("Nova versão"), expect.stringContaining("Arquivada")])
        expect(within(entries[1]!).getByText("05/10/2026 → 10/10/2026")).toBeTruthy()

        fireEvent.click(screen.getByRole("button", { name: /Arquivar/ }))
        expect(screen.getByText(/A meta anterior volta a valer: Versão anterior/)).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Arquivar" }))
        expect(goalAction).toHaveBeenCalledWith({ id: "g3", action: "archive" }, expect.anything())
    })

    it("metas: a arquivada abre só leitura com Restaurar como atual; sem meta, convite para definir", () => {
        goals.history = [goal("g1", { name: "Antiga", status: "archived", archivedAt: "2026-10-04T12:00:00.000Z", activePeriods: [{ from: "2026-10-01T12:00:00.000Z", to: "2026-10-04T12:00:00.000Z" }] })]
        render(<GoalsPage />)
        expect(screen.getByText("Nenhuma meta ativa")).toBeTruthy()
        fireEvent.click(within(screen.getByRole("navigation", { name: "Linha do tempo" })).getByRole("button"))
        fireEvent.click(screen.getByRole("button", { name: /Restaurar como atual/ }))
        expect(goalAction).toHaveBeenCalledWith({ id: "g1", action: "restore" }, expect.anything())
    })
})

