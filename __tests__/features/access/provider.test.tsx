// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import type { SessionDto } from "@/features/access/types"

const state = vi.hoisted(() => ({ session: undefined as SessionDto | undefined, resetPusher: vi.fn(), pathname: "/integracoes" }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }), usePathname: () => state.pathname }))
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get: async () => ({ data: { data: state.session } }), post: vi.fn() }, apiErrorCode: vi.fn(), apiErrorMessage: () => "Erro de acesso" }))
vi.mock("@/lib/pusher/client", () => ({ resetPusherClient: state.resetPusher }))
vi.mock("@/features/access/components/ViewAsControls", () => ({ ViewAsControls: () => null }))
vi.mock("@/features/auth/components/PasswordChange", () => ({ PasswordChange: () => <p>Troca obrigatória</p> }))
import { AccessProvider } from "@/features/access/components/AccessProvider"
let dataClient: QueryClient
function Probe() { const client = useQueryClient(); useEffect(() => { dataClient = client }, [client]); return <p>Conteúdo protegido</p> }
beforeEach(() => {
    vi.clearAllMocks(); sessionStorage.clear(); state.pathname = "/integracoes"
    state.session = { user: { id: "a".repeat(24), name: "Pessoa", email: "pessoa@example.test", mustChangePassword: false }, access: { permissions: ["*"], roles: [], realIsAdministrator: true, simulation: null } }
})
afterEach(cleanup)
const mount = (root: QueryClient) => render(<QueryClientProvider client={root}><AccessProvider><Probe /></AccessProvider></QueryClientProvider>)
describe("fronteira de sessão e dados", () => {
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
    it("primeiro acesso não monta conteúdo administrativo", async () => {
        state.session!.user.mustChangePassword = true
        mount(new QueryClient())
        await screen.findByText("Troca obrigatória")
        expect(screen.queryByText("Conteúdo protegido")).toBeNull()
    })
    it("acesso direto à página de usuários exige a permissão correspondente", async () => {
        state.pathname = "/usuarios"
        state.session!.access.permissions = ["admin.access", "roles.view"]
        mount(new QueryClient())
        await screen.findByRole("heading", { name: "Sem acesso" })
        expect(screen.queryByText("Conteúdo protegido")).toBeNull()
    })
})
