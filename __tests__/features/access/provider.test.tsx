// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query"
import { useEffect, type ReactNode } from "react"
import type { SessionDto } from "@/features/access/types"

const state = vi.hoisted(() => ({ session: undefined as SessionDto | undefined, resetPusher: vi.fn(), pathname: "/integracoes", pending: null as Promise<void> | null }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }), usePathname: () => state.pathname }))
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: async () => { if (state.pending) await state.pending; return { data: { data: state.session } } }, post: vi.fn() }, apiErrorCode: vi.fn(), apiErrorMessage: () => "Erro de acesso" }))
vi.mock("@/lib/pusher/client", () => ({ resetPusherClient: state.resetPusher }))
vi.mock("framer-motion", async () => (await import("../../helpers/framer-motion")).framerMotionMock())
vi.mock("@tsparticles/react", () => ({ default: () => <div data-testid="particles" />, ParticlesProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock("@tsparticles/slim", () => ({ loadSlim: vi.fn() }))
vi.mock("@/features/access/components/ViewAsControls", () => ({ ViewAsControls: () => null }))
vi.mock("@/features/platform/components/LegalAcceptance", () => ({ LegalAcceptance: () => <p>Aceite obrigatório</p> }))
vi.mock("@/features/businesses/components/InterviewScreen", () => ({ InterviewScreen: ({ mode }: { mode: string }) => <p>Entrevista {mode}</p> }))
import { AccessProvider } from "@/features/access/components/AccessProvider"
let dataClient: QueryClient
function Probe() { const client = useQueryClient(); useEffect(() => { dataClient = client }, [client]); return <p>Conteúdo protegido</p> }
beforeEach(() => {
    vi.clearAllMocks(); sessionStorage.clear(); state.pathname = "/integracoes"; state.pending = null
    state.session = { user: { id: "a".repeat(24), name: "Pessoa", email: "pessoa@example.test", legalAcceptanceRequired: false, legalVersion: 1 }, access: { permissions: ["*"], roles: [], realIsAdministrator: true, simulation: null } }
})
afterEach(cleanup)
const mount = (root: QueryClient) => render(<QueryClientProvider client={root}><AccessProvider><Probe /></AccessProvider></QueryClientProvider>)
describe("fronteira de sessão e dados", () => {
    it("mostra o loading animado enquanto a sessão é validada e só então o conteúdo", async () => {
        let release!: () => void
        state.pending = new Promise<void>((resolve) => { release = resolve })
        mount(new QueryClient({ defaultOptions: { queries: { retry: false } } }))
        const status = await screen.findByRole("status", { name: "Carregando acesso" })
        expect(status.textContent).toContain("Ciliar")
        expect(screen.queryByText("Conteúdo protegido")).toBeNull()
        await act(async () => { release() })
        await screen.findByText("Conteúdo protegido")
        expect(screen.queryByRole("status", { name: "Carregando acesso" })).toBeNull()
    })
    it("descarta o cache anterior antes de renderizar uma autoridade diferente", async () => {
        const root = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        mount(root); await screen.findByText("Conteúdo protegido")
        const old = dataClient
        old.setQueryData(["sensitive"], "dados privilegiados")
        expect(old).not.toBe(root)
        state.session = { ...state.session!, access: { ...state.session!.access, permissions: ["admin.access", "integrations.smtp.view"], realIsAdministrator: false } }
        act(() => root.setQueryData(["session", "none"], state.session))
        await waitFor(() => expect(dataClient).not.toBe(old))
        expect(dataClient.getQueryData(["sensitive"])).toBeUndefined()
        expect(old.getQueryData(["sensitive"])).toBeUndefined()
        expect(state.resetPusher).toHaveBeenCalled()
    })
    it("sem aceite da versão vigente dos termos não monta conteúdo administrativo", async () => {
        state.session!.user.legalAcceptanceRequired = true
        mount(new QueryClient())
        await screen.findByText("Aceite obrigatório")
        expect(screen.queryByText("Conteúdo protegido")).toBeNull()
    })
    it("acesso direto à página de usuários exige a permissão correspondente", async () => {
        state.pathname = "/usuarios"
        state.session!.access.permissions = ["admin.access", "roles.view"]
        mount(new QueryClient())
        await screen.findByRole("heading", { name: "Sem acesso" })
        expect(screen.queryByText("Conteúdo protegido")).toBeNull()
    })
    it("onboarding obrigatório: só a entrevista em tela cheia, sem o conteúdo", async () => {
        state.pathname = "/negocios"
        state.session!.access.permissions = ["businesses.use"]
        state.session!.onboarding = { required: true, interviewId: null, archived: 0 }
        mount(new QueryClient())
        await screen.findByText("Entrevista onboarding")
        expect(screen.queryByText("Conteúdo protegido")).toBeNull()
    })
    it("regressão: prestador sem o painel abre /clientes com Clientes › Visualizar e fica sem acesso sem ela", async () => {
        state.pathname = "/clientes"
        state.session!.access.permissions = ["businesses.use", "clients.view"]
        state.session!.onboarding = { required: false, interviewId: null, archived: 0 }
        const first = mount(new QueryClient())
        await screen.findByText("Conteúdo protegido")
        first.unmount()
        state.session!.access.permissions = ["businesses.use"]
        mount(new QueryClient())
        await screen.findByRole("heading", { name: "Sem acesso" })
    })
    it("prestador sem o painel acessa Negócios", async () => {
        state.pathname = "/negocios"
        state.session!.access.permissions = ["businesses.use"]
        state.session!.onboarding = { required: false, interviewId: null, archived: 0 }
        mount(new QueryClient())
        await screen.findByText("Conteúdo protegido")
    })
})
