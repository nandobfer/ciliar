// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const state = vi.hoisted(() => ({ signIn: vi.fn(), resetPusher: vi.fn(), reduced: false, options: {} as { particles?: { move?: { enable?: boolean }; links?: { enable?: boolean }; color?: { value?: string } }; interactivity?: { events?: { onClick?: { enable?: boolean } } } } }))
vi.mock("next-auth/react", () => ({ signIn: state.signIn }))
vi.mock("@/lib/pusher/client", () => ({ resetPusherClient: state.resetPusher }))
vi.mock("framer-motion", async () => ({ ...(await import("../../helpers/framer-motion")).framerMotionMock(), useReducedMotion: () => state.reduced }))
vi.mock("@tsparticles/react", () => ({ default: ({ options }: { options: typeof state.options }) => { state.options = options; return <div data-testid="particles" /> }, ParticlesProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock("@tsparticles/slim", () => ({ loadSlim: vi.fn() }))
import { LoginPage } from "@/features/auth/components/LoginPage"
import { loginErrorMessage, LOGIN_ERROR_MESSAGES } from "@/features/auth/login-errors"

afterEach(cleanup)
beforeEach(() => { vi.clearAllMocks(); state.reduced = false; sessionStorage.clear(); document.documentElement.style.setProperty("--primary", "215 89% 41%") })
const mount = (props: Parameters<typeof LoginPage>[0] = {}) => render(<QueryClientProvider client={new QueryClient()}><LoginPage {...props} /></QueryClientProvider>)

describe("login original do Opex no Ciliar, somente com Google", () => {
    it("mantém identidade e partículas conectadas usando o tema, sem campos de senha", async () => {
        mount()
        expect(screen.getByRole("heading", { name: "Ciliar" })).toBeTruthy()
        expect(screen.getByRole("button", { name: "Entrar com Google" })).toBeTruthy()
        expect(screen.queryByLabelText("Senha")).toBeNull()
        expect(screen.queryByLabelText("E-mail")).toBeNull()
        expect(screen.getByRole("link", { name: "termos de uso" }).getAttribute("href")).toBe("/termos")
        expect(screen.getByRole("link", { name: "política de privacidade" }).getAttribute("href")).toBe("/privacidade")
        await waitFor(() => expect(screen.getByTestId("particles")).toBeTruthy())
        expect(state.options.particles?.links?.enable).toBe(true)
        expect(state.options.particles?.color?.value).toBe("hsl(215 89% 41%)")
        expect(state.options.particles?.move?.enable).toBe(true)
    })
    it("desliga movimento e interatividade com movimento reduzido", () => {
        state.reduced = true; mount()
        expect(state.options.particles?.move?.enable).toBe(false)
        expect(state.options.interactivity?.events?.onClick?.enable).toBe(false)
        expect(state.options.particles?.links?.enable).toBe(true)
    })
    it("limpa a simulação da aba e impede redirect externo ao entrar", async () => {
        sessionStorage.setItem("perfix-view-as", "x")
        mount({ nextPath: "//evil.example" })
        fireEvent.click(screen.getByRole("button", { name: "Entrar com Google" }))
        await waitFor(() => expect(state.signIn).toHaveBeenCalledWith("google", { redirectTo: "/integracoes" }))
        expect(state.resetPusher).toHaveBeenCalled()
        cleanup(); vi.clearAllMocks()
        mount({ nextPath: "/usuarios" })
        fireEvent.click(screen.getByRole("button", { name: "Entrar com Google" }))
        await waitFor(() => expect(state.signIn).toHaveBeenCalledWith("google", { redirectTo: "/usuarios" }))
    })
    it("exibe o motivo da recusa e bloqueia o botão sem configuração", () => {
        mount({ notice: loginErrorMessage("cadastro-indisponivel"), disabled: true })
        expect(screen.getByText(LOGIN_ERROR_MESSAGES["cadastro-indisponivel"])).toBeTruthy()
        expect((screen.getByRole("button", { name: "Entrar com Google" }) as HTMLButtonElement).disabled).toBe(true)
        expect(loginErrorMessage("desconhecido")).toBe(LOGIN_ERROR_MESSAGES.falha)
        expect(loginErrorMessage(undefined, "AccessDenied")).toBe(LOGIN_ERROR_MESSAGES.falha)
        expect(loginErrorMessage(undefined, "Configuration")).toMatch(/configuração/)
        expect(loginErrorMessage()).toBeUndefined()
    })
})
