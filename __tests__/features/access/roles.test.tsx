// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { PermissionsProvider } from "@nandobfer/perfix/react"
import type { RoleDetail } from "@/features/access/hooks/useAccessAdmin"
const state = vi.hoisted(() => ({ role: undefined as RoleDetail | undefined, mutateAsync: vi.fn(), error: false, push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock("@/features/access/hooks/useAccessAdmin", () => ({
    useRole: () => ({ data: state.role, isPending: false, isError: state.error }),
    useUsers: () => ({ data: [], isPending: false, isError: false }),
    useAccessMutation: () => ({ mutateAsync: state.mutateAsync, isPending: false }),
}))
vi.mock("@/features/access/components/AccessProvider", () => ({ useAppSession: () => ({ session: { user: { id: "a".repeat(24) } } }) }))
import { RolePage } from "@/features/access/components/RoleEditor"
import { COLOR_TOKENS, getColor } from "@/lib/constants/color-palette"
const id = "b".repeat(24)
const page = () => <PermissionsProvider permissions={["*"]} roles={[{ id: "a".repeat(24), slug: "admin", nome: "Administrador", ativo: true, permissoes: ["*"], escopos: [], posicao: 0 }]} realIsAdmin><RolePage id={id} /></PermissionsProvider>
beforeEach(() => {
    vi.clearAllMocks(); state.error = false; state.mutateAsync.mockRejectedValue(new Error("Conflito de versão"))
    state.role = { id, slug: "leitor", nome: "Leitor", descricao: "Leitura", cor: "roxo", ativo: true, permissoes: ["admin.access"], escopos: [], posicao: 1, version: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), membros: [], audit: [] }
})
afterEach(cleanup)
describe("editor de perfis e concorrência", () => {
    it("mantém a versão da abertura e o rascunho mesmo após refetch e conflito", async () => {
        const view = render(page())
        fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Meu rascunho" } })
        state.role = { ...state.role!, version: 1, nome: "Edição em outra sessão" }
        view.rerender(page())
        expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("Meu rascunho")
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ version: 0, nome: "Meu rascunho" }) })))
        expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("Meu rascunho")
        expect(state.push).not.toHaveBeenCalled()
    })
    it("seleciona a cor pelas bolinhas da paleta (token, não hex), como no crm-marketing-campanhas", async () => {
        render(page())
        const group = screen.getByRole("radiogroup", { name: "Cor do perfil" })
        expect(screen.queryByRole("combobox")).toBeNull()
        expect(group.querySelectorAll("[role=radio]").length).toBe(COLOR_TOKENS.length)
        expect(screen.getByRole("radio", { name: getColor("roxo").label }).getAttribute("aria-checked")).toBe("true")
        fireEvent.click(screen.getByRole("radio", { name: getColor("verde").label }))
        expect(screen.getByRole("radio", { name: getColor("verde").label }).getAttribute("aria-checked")).toBe("true")
        expect(screen.getByRole("radio", { name: getColor("roxo").label }).getAttribute("aria-checked")).toBe("false")
        fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
        await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cor: "verde" }) })))
    })
    it("erro de refetch não desmonta um formulário já preenchido", () => {
        const view = render(page())
        fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Rascunho importante" } })
        state.error = true; view.rerender(page())
        expect(screen.getByRole("alert").textContent).toContain("rascunho foi preservado")
        expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("Rascunho importante")
    })
})
