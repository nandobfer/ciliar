// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { PermissionsProvider, ViewAsProvider } from "@nandobfer/perfix/react"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/view-as/hooks/useViewAsOptions", () => ({
    useViewAsRoles: () => ({ data: [{ id: "admin", nome: "Administrador", cor: "roxo", coringa: true }, { id: "reader", nome: "Leitor", cor: "azul", coringa: false }], isPending: false, isError: false }),
    useViewAsUsers: (search: string) => ({ data: { items: [{ id: "maria", nome: "Maria", email: "maria@example.test", cargos: [{ id: "reader", nome: "Leitor", cor: "azul" }] }].filter(user => `${user.nome} ${user.email}`.includes(search)) }, isPending: false, isFetching: false, isError: false, term: search }),
}))
import { ViewAsControls } from "@/features/access/components/ViewAsControls"
beforeEach(() => sessionStorage.clear())
afterEach(cleanup)
const mount = (admin = true) => render(<ViewAsProvider><PermissionsProvider permissions={admin ? ["*"] : ["admin.access"]} roles={[]} realIsAdmin={admin}><ViewAsControls /></PermissionsProvider></ViewAsProvider>)
describe("header e Visualizar como copiados do Shekinah", () => {
    it("sem simulação mostra só o header neutro e o popover, nunca um diálogo/faixa de aviso", () => {
        mount()
        const trigger = screen.getByRole("button", { name: "Visualizar como outro perfil ou usuário" })
        expect(trigger.parentElement?.className).toBe("flex h-14 shrink-0 items-center justify-end border-b border-border bg-card px-4")
        expect(screen.queryByRole("status")).toBeNull()
        fireEvent.click(trigger)
        expect(screen.getByRole("listbox", { name: "Perfis" })).toBeTruthy()
        expect(screen.getByRole("option", { name: /Administrador/ }).getAttribute("aria-selected")).toBe("true")
    })
    it("escolhe perfil pelo popover e encerra pela faixa original", () => {
        mount()
        fireEvent.click(screen.getByRole("button", { name: "Visualizar como outro perfil ou usuário" }))
        fireEvent.click(screen.getByRole("option", { name: "Leitor" }))
        expect(screen.getByRole("status").textContent).toContain("Visualizando como Leitor")
        fireEvent.click(screen.getByRole("button", { name: "Sair da simulação" }))
        expect(screen.queryByRole("status")).toBeNull()
    })
    it("segunda etapa mantém busca, e-mail e chips dos perfis do usuário", () => {
        mount()
        fireEvent.click(screen.getByRole("button", { name: "Visualizar como outro perfil ou usuário" }))
        fireEvent.click(screen.getByRole("button", { name: "Selecionar usuário" }))
        expect(screen.getByText("maria@example.test")).toBeTruthy()
        fireEvent.change(screen.getByRole("textbox", { name: "Buscar usuário" }), { target: { value: "inexistente" } })
        expect(screen.getByText(/Nenhum usuário encontrado/)).toBeTruthy()
        fireEvent.change(screen.getByRole("textbox", { name: "Buscar usuário" }), { target: { value: "Maria" } })
        fireEvent.click(screen.getByRole("option", { name: /Maria/ }))
        expect(screen.getByRole("status").textContent).toContain("Visualizando como Maria")
    })
    it("usuário sem administração real não recebe seletor", () => {
        mount(false)
        expect(screen.queryByRole("button")).toBeNull()
    })
})
