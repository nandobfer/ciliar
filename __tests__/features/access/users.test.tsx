// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { PermissionsProvider } from "@nandobfer/perfix/react"
import type { RoleDto, UserDto } from "@/features/access/types"
import { framerMotionMock } from "../../helpers/framer-motion"

const state = vi.hoisted(() => ({ mutateAsync: vi.fn(), users: [] as UserDto[], roles: [] as RoleDto[] }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/access/hooks/useAccessAdmin", () => ({
    useUsers: () => ({ data: state.users, isPending: false, isError: false }),
    useAssignableRoles: () => ({ data: state.roles, isPending: false, isError: false }),
    useAccessMutation: () => ({ mutateAsync: state.mutateAsync, isPending: false }),
}))
vi.mock("@/features/access/components/AccessProvider", () => ({ useAppSession: () => ({ session: { user: { id: "a".repeat(24) } } }) }))
import { UsersPage } from "@/features/access/components/UsersPage"

const role: RoleDto = { id: "b".repeat(24), slug: "leitor", nome: "Leitor", descricao: "Somente leitura", cor: "roxo", ativo: true, permissoes: ["admin.access"], escopos: [], posicao: 1, version: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
beforeEach(() => {
    vi.clearAllMocks(); state.mutateAsync.mockResolvedValue({ id: "c".repeat(24) }); state.roles = [role]
    state.users = [{ id: "d".repeat(24), nome: "Maria", email: "maria@example.test", ativo: true, version: 0, roleIds: [role.id], cargos: [role], gerenciavel: true }]
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
    it("cadastra em etapas com confirmação de senha e seleção explícita de perfil", async () => {
        mount(["*"]); fireEvent.click(screen.getByRole("button", { name: "Novo Usuário" }))
        fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Nova Pessoa" } })
        fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "nova@example.test" } })
        fireEvent.change(screen.getByLabelText("Senha inicial (12 a 128 caracteres)"), { target: { value: "Senha inicial 123!" } })
        fireEvent.change(screen.getByLabelText("Confirme a senha"), { target: { value: "Senha inicial 123!" } })
        fireEvent.click(screen.getByRole("button", { name: "Definir Perfis" }))
        await waitFor(() => expect(screen.getByRole("button", { name: "Criar Usuário" })).toBeTruthy())
        fireEvent.click(screen.getByRole("checkbox", { name: /Leitor/ }))
        fireEvent.click(screen.getByRole("button", { name: "Criar Usuário" }))
        await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledWith({ path: "/users", method: "post", data: { nome: "Nova Pessoa", email: "nova@example.test", password: "Senha inicial 123!", ativo: true, cargos: [role.id] } }))
    })
})
