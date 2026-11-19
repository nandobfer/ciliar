// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"

const state = vi.hoisted(() => ({ reduced: false, options: {} as { particles?: { move?: { enable?: boolean } } } }))
vi.mock("framer-motion", async () => ({ ...(await import("../../helpers/framer-motion")).framerMotionMock(), useReducedMotion: () => state.reduced }))
vi.mock("@tsparticles/react", () => ({ default: ({ options }: { options: typeof state.options }) => { state.options = options; return <div data-testid="particles" /> }, ParticlesProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock("@tsparticles/slim", () => ({ loadSlim: vi.fn() }))
import { LandingPage } from "@/features/landing/components/LandingPage"
import { LANDING_FEATURES, LANDING_NAV, LANDING_PLANS, LANDING_STEPS, landingCta } from "@/features/landing/content"

afterEach(cleanup)
beforeEach(() => { state.reduced = false; state.options = {}; document.documentElement.style.scrollBehavior = ""; document.documentElement.style.setProperty("--primary", "215 89% 41%") })

const links = (name: string) => screen.getAllByRole("link", { name }).map((link) => link.getAttribute("href"))

describe("landingCta", () => {
    it("visitante testa grátis pelo login; com sessão vai ao painel", () => {
        expect(landingCta(false)).toEqual({ label: "Testar grátis", href: "/login" })
        expect(landingCta(true)).toEqual({ label: "Ir para o painel", href: "/integracoes" })
    })
})

describe("landing pública do Ciliar", () => {
    it("visitante vê \"Testar grátis\" (topo, cabeçalho e CTA final) levando ao login, e \"Entrar\"", () => {
        render(<LandingPage authenticated={false} />)
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
        const cta = links("Testar grátis")
        expect(cta.length).toBeGreaterThanOrEqual(3)
        expect(cta.every((href) => href === "/login")).toBe(true)
        expect(screen.queryByRole("link", { name: "Ir para o painel" })).toBeNull()
        expect(links("Entrar")).toContain("/login")
    })

    it("com sessão o CTA vira \"Ir para o painel\" e não há \"Testar grátis\" nem \"Entrar\"", () => {
        render(<LandingPage authenticated />)
        const cta = links("Ir para o painel")
        expect(cta.length).toBeGreaterThanOrEqual(3)
        expect(cta.every((href) => href === "/integracoes")).toBe(true)
        expect(screen.queryByRole("link", { name: "Testar grátis" })).toBeNull()
        expect(screen.queryByRole("link", { name: "Entrar" })).toBeNull()
    })

    it("tem as seções com âncoras do menu, passos e recursos do produto", () => {
        const { container } = render(<LandingPage authenticated={false} />)
        for (const item of LANDING_NAV) {
            expect(container.querySelector(`section#${item.id}`)).toBeTruthy()
            expect(links(item.label)).toContain(`#${item.id}`)
        }
        for (const step of LANDING_STEPS) expect(screen.getByRole("heading", { level: 3, name: new RegExp(step.title) })).toBeTruthy()
        for (const feature of LANDING_FEATURES) expect(screen.getByRole("heading", { level: 3, name: feature.title })).toBeTruthy()
        expect(screen.getByRole("figure", { name: "Exemplo de conversa com o Agente Entrevistador" })).toBeTruthy()
    })

    it("Planos é placeholder: selo \"Em desenvolvimento\", 3 cards e nenhum preço", () => {
        const { container } = render(<LandingPage authenticated={false} />)
        const plans = container.querySelector<HTMLElement>("section#planos")!
        expect(within(plans).getByRole("heading", { level: 2, name: "Planos" })).toBeTruthy()
        expect(within(plans).getByText(LANDING_PLANS.badge)).toBeTruthy()
        expect(within(plans).getAllByRole("listitem")).toHaveLength(3)
        expect(plans.textContent).not.toMatch(/R\$|US\$|€|\/mês/)
        expect(within(plans).queryByRole("link")).toBeNull()
        expect(within(plans).queryByRole("button")).toBeNull()
    })

    it("rodapé leva aos termos e à política de privacidade", () => {
        render(<LandingPage authenticated={false} />)
        const footer = screen.getByRole("contentinfo")
        expect(within(footer).getByRole("link", { name: "Termos de uso" }).getAttribute("href")).toBe("/termos")
        expect(within(footer).getByRole("link", { name: "Política de privacidade" }).getAttribute("href")).toBe("/privacidade")
    })

    it("menu do celular abre e fecha com as âncoras", () => {
        render(<LandingPage authenticated={false} />)
        expect(screen.queryByRole("navigation", { name: "Seções (menu)" })).toBeNull()
        fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }))
        const menu = screen.getByRole("navigation", { name: "Seções (menu)" })
        fireEvent.click(within(menu).getByRole("link", { name: "Planos" }))
        expect(screen.queryByRole("navigation", { name: "Seções (menu)" })).toBeNull()
    })

    it("usa o fundo de partículas do login e rolagem suave; movimento reduzido desliga ambos", async () => {
        const { unmount } = render(<LandingPage authenticated={false} />)
        await waitFor(() => expect(screen.getByTestId("particles")).toBeTruthy())
        expect(state.options.particles?.move?.enable).toBe(true)
        expect(document.documentElement.style.scrollBehavior).toBe("smooth")
        unmount()
        expect(document.documentElement.style.scrollBehavior).toBe("")

        state.reduced = true
        render(<LandingPage authenticated={false} />)
        await waitFor(() => expect(state.options.particles?.move?.enable).toBe(false))
        expect(document.documentElement.style.scrollBehavior).toBe("")
        expect(screen.getAllByRole("link", { name: "Testar grátis" }).length).toBeGreaterThanOrEqual(3)
    })
})
