// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

const state = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), mutate: vi.fn(), reduced: false, options: {} as { particles?: { move?: { enable?: boolean }; links?: { enable?: boolean }; color?: { value?: string } }; interactivity?: { events?: { onClick?: { enable?: boolean } } } } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace, refresh: state.refresh }) }))
vi.mock("@/features/auth/hooks/useLogin", () => ({ useLogin: () => ({ mutate: state.mutate, isPending: false }) }))
vi.mock("framer-motion", async () => ({ ...(await import("../../helpers/framer-motion")).framerMotionMock(), useReducedMotion: () => state.reduced }))
vi.mock("@tsparticles/react", () => ({ default: ({ options }: { options: typeof state.options }) => { state.options = options; return <div data-testid="particles" /> }, ParticlesProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock("@tsparticles/slim", () => ({ loadSlim: vi.fn() }))
import { LoginPage } from "@/features/auth/components/LoginPage"

afterEach(cleanup)
beforeEach(() => { vi.clearAllMocks(); state.reduced = false; document.documentElement.style.setProperty("--primary", "270 100% 50%") })
describe("login original do Opex no Ciliar", () => {
    it("mantém formulário acessível, identidade e partículas conectadas usando o tema", async () => {
        render(<LoginPage />)
        expect(screen.getByRole("heading", { name: "Ciliar" })).toBeTruthy()
        expect(screen.getByLabelText("E-mail").getAttribute("type")).toBe("email")
        expect(screen.getByLabelText("Senha").getAttribute("type")).toBe("password")
        await waitFor(() => expect(screen.getByTestId("particles")).toBeTruthy())
        expect(state.options.particles?.links?.enable).toBe(true)
        expect(state.options.particles?.color?.value).toBe("hsl(270 100% 50%)")
        expect(state.options.particles?.move?.enable).toBe(true)
    })
    it("desliga movimento e interatividade com movimento reduzido", () => {
        state.reduced = true; render(<LoginPage />)
        expect(state.options.particles?.move?.enable).toBe(false)
        expect(state.options.interactivity?.events?.onClick?.enable).toBe(false)
        expect(state.options.particles?.links?.enable).toBe(true)
    })
    it("valida e-mail antes de submeter e impede redirect externo", async () => {
        render(<LoginPage nextPath="//evil.example" />)
        fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "pessoa@example.test" } })
        fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "Senha de teste 123!" } })
        fireEvent.submit(screen.getByRole("button", { name: "Entrar" }).closest("form")!)
        await waitFor(() => expect(state.mutate).toHaveBeenCalled())
        const options = state.mutate.mock.calls[0]![1] as { onSuccess: (result: { redirectTo: string }) => void }
        options.onSuccess({ redirectTo: "/integracoes" })
        expect(state.replace).toHaveBeenCalledWith("/integracoes")
        expect(state.refresh).toHaveBeenCalled()
    })
})
