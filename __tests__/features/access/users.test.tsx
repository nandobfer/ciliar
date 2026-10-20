// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { PermissionsProvider } from "@nandobfer/perfix/react"
import type { RoleDto, UserDto } from "@/features/access/types"
import { framerMotionMock } from "../../helpers/framer-motion"

const state = vi.hoisted(() => ({ mutateAsync: vi.fn(), resend: vi.fn(), smtp: false, users: [] as UserDto[], roles: [] as RoleDto[] }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/access/hooks/useAccessAdmin", () => ({
    useUsers: () => ({ data: state.users, isPending: false, isError: false }),
    useAssignableRoles: () => ({ data: state.roles, isPending: false, isError: false }),
    useAccessMutation: () => ({ mutateAsync: state.mutateAsync, isPending: false }),
    useInviteStatus: () => ({ data: { smtpConfigured: state.smtp }, isSuccess: true }),
    useResendInvite: () => ({ mutate: state.resend, isPending: false }),
}))
vi.mock("@/features/access/components/AccessProvider", () => ({ useAppSession: () => ({ session: { user: { id: "a".repeat(24) } } }) }))
import { UsersPage } from "@/features/access/components/UsersPage"

const role: RoleDto = { id: "b".repeat(24), slug: "leitor", nome: "Leitor", descricao: "Somente leitura", cor: "roxo", ativo: true, permissoes: ["admin.access"], escopos: [], posicao: 1, version: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
beforeEach(() => {
    vi.clearAllMocks(); state.mutateAsync.mockResolvedValue({ success: true, data: { id: "c".repeat(24), convite: "nao-solicitado" } }); state.roles = [role]; state.smtp = false
    state.users = [{ id: "d".repeat(24), nome: "Maria", email: "maria@example.test", ativo: true, version: 0, roleIds: [role.id], cargos: [role], gerenciavel: true, convitePendente: false, ultimoAcesso: null, termosAceitos: 1 }]
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const mount = (permissions: string[]) => render(<PermissionsProvider permissions={permissions} roles={[]} realIsAdmin={permissions.includes("*")}><UsersPage /></PermissionsProvider>)
describe("cadastro de usuários", () => {
    it("usuário somente leitura não recebe ações de cadastro, edição ou exclusão", async () => {
        mount(["admin.access", "users.view"])
        expect(screen.getByText("Maria")).toBeTruthy()
        expect(screen.queryByRole("button", { name: "Novo Usuário" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Editar" })).toBeNull()
        expect(screen.queryByRole("button", { name: "Excluir" })).toBeNull()
        fireEvent.change(screen.getByRole("textbox", { name: "Buscar usuários" }), { target: { value: "outra pessoa" } })
        await waitFor(() => expect(screen.getByText("Nenhum usuário encontrado.")).toBeTruthy())
    })
    it("usa ações originais do Opex sem perder o ID e a versão da exclusão", async () => {
        vi.spyOn(window, "confirm").mockReturnValue(true)
        mount(["*"])
        const actions = within(screen.getByRole("group", { name: "Ações de Maria" }))
        expect(actions.getByRole("button", { name: "Editar" }).className).toContain("text-emerald-400")
        fireEvent.click(actions.getByRole("button", { name: "Excluir" }))
        await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledWith({ path: `/users/${"d".repeat(24)}`, method: "delete", data: { version: 0 } }))
    })
    it("filtro de status e limpar usam os componentes do Opex", () => {
        mount(["*"])
        fireEvent.click(screen.getByRole("button", { name: "Todos" }))
        fireEvent.click(screen.getByText("Inativo"))
        expect(screen.getByText("Nenhum usuário encontrado.")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }))
        expect(screen.getByRole("table", { name: "Usuários" })).toBeTruthy()
    })
    it("pré-cadastra em etapas, sem senha, com seleção explícita de perfil (convite por e-mail indisponível sem SMTP)", async () => {
        mount(["*"]); fireEvent.click(screen.getByRole("button", { name: "Novo Usuário" }))
        expect(screen.queryByLabelText(/Senha/)).toBeNull()
        expect(screen.getByText("Configure o SMTP em Integrações para enviar convites por e-mail.")).toBeTruthy()
        expect((screen.getByRole("checkbox", { name: "Enviar convite por e-mail" }) as HTMLButtonElement).disabled).toBe(true)
        fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Nova Pessoa" } })
        fireEvent.change(screen.getByLabelText("E-mail da conta Google"), { target: { value: "nova@example.test" } })
        fireEvent.click(screen.getByRole("button", { name: "Definir Perfis" }))
        await waitFor(() => expect(screen.getByRole("button", { name: "Criar Usuário" })).toBeTruthy())
        fireEvent.click(screen.getByRole("checkbox", { name: /Leitor/ }))
        fireEvent.click(screen.getByRole("button", { name: "Criar Usuário" }))
        await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledWith({ path: "/users", method: "post", data: { nome: "Nova Pessoa", email: "nova@example.test", ativo: true, cargos: [role.id], enviarConvite: false } }))
    })
    it("com SMTP configurado o convite por e-mail vem marcado", async () => {
        state.smtp = true
        mount(["*"]); fireEvent.click(screen.getByRole("button", { name: "Novo Usuário" }))
        await waitFor(() => expect((screen.getByRole("checkbox", { name: "Enviar convite por e-mail" }) as HTMLInputElement).checked).toBe(true))
        fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Nova Pessoa" } })
        fireEvent.change(screen.getByLabelText("E-mail da conta Google"), { target: { value: "nova@example.test" } })
        fireEvent.click(screen.getByRole("button", { name: "Definir Perfis" }))
        await waitFor(() => expect(screen.getByRole("button", { name: "Criar Usuário" })).toBeTruthy())
        fireEvent.click(screen.getByRole("checkbox", { name: /Leitor/ }))
        fireEvent.click(screen.getByRole("button", { name: "Criar Usuário" }))
        await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ enviarConvite: true }) })))
    })
    it("marca convite pendente na listagem e permite reenviar na edição", async () => {
        state.users = [{ ...state.users[0]!, convitePendente: true }]
        mount(["*"])
        expect(screen.getByText("Convite pendente")).toBeTruthy()
        fireEvent.click(within(screen.getByRole("group", { name: "Ações de Maria" })).getByRole("button", { name: "Editar" }))
        fireEvent.click(await screen.findByRole("button", { name: "Reenviar convite" }))
        expect(state.resend).toHaveBeenCalledWith("d".repeat(24))
    })
})
