// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"

const state = vi.hoisted(() => ({ pathname: "/negocios", business: null as unknown }))
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }))
vi.mock("@nandobfer/perfix/react", () => ({ usePermissions: () => ({ can: () => true, canAny: () => true }) }))
vi.mock("@/features/businesses/hooks/useBusinesses", () => ({ useBusiness: (id: string | null) => ({ data: id ? state.business : undefined }) }))
vi.mock("@/features/businesses/components/BusinessSwitcher", () => ({ activeBusinessId: (pathname: string) => /^\/negocios\/([a-f\d]{24})(?:\/|$)/i.exec(pathname)?.[1] ?? null }))

import { BusinessThemeController } from "@/features/businesses/components/space/BusinessThemeController"
import { setThemePreview } from "@/features/businesses/components/space/theme-preview"
import { GoalWindowLine } from "@/features/businesses/components/space/GoalProgressCard"

const ID = "a".repeat(24)
const styleTag = () => document.getElementById("ciliar-business-theme")

describe("tema do negócio na tela", () => {
    beforeEach(() => {
        document.documentElement.className = "dark"
        state.pathname = "/negocios"
        state.business = { id: ID, theme: { primaryColor: "#FF6600", mode: "light" } }
    })
    afterEach(() => {
        cleanup()
        act(() => setThemePreview(null))
    })

    it("telas globais ficam no padrão; no espaço vale a cor como regra :root e o modo claro troca a classe do <html>", () => {
        const view = render(<BusinessThemeController />)
        expect(styleTag()).toBeNull()
        expect(document.documentElement.classList.contains("dark")).toBe(true)

        state.pathname = `/negocios/${ID}/atividades`
        view.rerender(<BusinessThemeController />)
        expect(styleTag()?.textContent).toContain(":root, :root.light {")
        expect(document.documentElement.classList.contains("light")).toBe(true)
        expect(document.documentElement.classList.contains("dark")).toBe(false)

        state.pathname = "/negocios"
        view.rerender(<BusinessThemeController />)
        expect(styleTag()).toBeNull()
        expect(document.documentElement.className).toBe("dark")
    })

    it("pré-visualização ao vivo da ficha vence o tema salvo até sair", () => {
        state.pathname = `/negocios/${ID}/ficha`
        render(<BusinessThemeController />)
        const saved = styleTag()?.textContent
        act(() => setThemePreview({ businessId: ID, theme: { primaryColor: "#123456", mode: "dark" } }))
        expect(styleTag()?.textContent).not.toBe(saved)
        expect(document.documentElement.classList.contains("dark")).toBe(true)
        act(() => setThemePreview(null))
        expect(styleTag()?.textContent).toBe(saved)
    })
})

describe("progresso da meta", () => {
    it("mostra atingido × alvo e a meta por hora indisponível sem horas", () => {
        render(<GoalWindowLine goal={{ period: "month", targetCents: 800000 }} currency="BRL" window={{ key: "2026-10", label: "outubro/2026", from: "2026-10-01", to: "2026-10-31", revenueCents: 200000, minutes: 0, achievedCents: 200000, percent: 25, available: true }} />)
        expect(screen.getByText("outubro/2026")).toBeTruthy()
        expect(screen.getByText(/de R\$\s?8\.000,00/)).toBeTruthy()
        expect(screen.getByText("25%")).toBeTruthy()
        cleanup()
        render(<GoalWindowLine goal={{ period: "hour", targetCents: 15000 }} currency="BRL" window={{ key: "2026", label: "2026", from: "2026-01-01", to: "2026-12-31", revenueCents: 0, minutes: 0, achievedCents: null, percent: null, available: false }} />)
        expect(screen.getByText(/Indisponível/)).toBeTruthy()
    })
})
