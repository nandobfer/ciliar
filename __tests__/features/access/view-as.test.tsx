// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ViewAsProvider, useViewAs, getViewAsHeaderValue, VIEW_AS_STORAGE_KEY } from "@nandobfer/perfix/react"
import { readViewAs } from "@nandobfer/perfix"

function Probe() {
    const simulation = useViewAs()
    return <><p>{simulation.isSimulating ? simulation.state?.label.alvo : "Acesso real"}</p><button onClick={() => simulation.start({ viewAs: { tipo: "cargo", roleId: "a".repeat(24) }, label: { alvo: "Leitor" } })}>Simular</button><button onClick={simulation.stop}>Encerrar</button></>
}
beforeEach(() => { sessionStorage.clear(); document.cookie = "perfix-view-as=; max-age=0" })
afterEach(cleanup)
describe("simulação isolada por aba", () => {
    it("persiste no recarregamento, envia marcador explícito e encerra limpando a aba", async () => {
        const onChange = vi.fn()
        const first = render(<ViewAsProvider onChange={onChange}><Probe /></ViewAsProvider>)
        expect(getViewAsHeaderValue()).toBe("none")
        fireEvent.click(screen.getByText("Simular"))
        expect(screen.getByText("Leitor")).toBeTruthy()
        expect(sessionStorage.getItem(VIEW_AS_STORAGE_KEY)).toBeTruthy()
        expect(readViewAs({ header: getViewAsHeaderValue() }).viewAs).toEqual({ tipo: "cargo", roleId: "a".repeat(24) })
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "inicio" }))
        first.unmount()
        render(<ViewAsProvider onChange={onChange}><Probe /></ViewAsProvider>)
        await waitFor(() => expect(screen.getByText("Leitor")).toBeTruthy())
        fireEvent.click(screen.getByText("Encerrar"))
        expect(getViewAsHeaderValue()).toBe("none")
        expect(sessionStorage.getItem(VIEW_AS_STORAGE_KEY)).toBeNull()
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "fim" }))
    })
    it("cookie de outra aba não inicia simulação sem sessionStorage", () => {
        document.cookie = "perfix-view-as=outra-aba"
        render(<ViewAsProvider><Probe /></ViewAsProvider>)
        expect(screen.getByText("Acesso real")).toBeTruthy()
        expect(getViewAsHeaderValue()).toBe("none")
    })
})
