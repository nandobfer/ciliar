// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { MyLegalDto } from "@/features/platform/types"

const state = vi.hoisted(() => ({ data: null as MyLegalDto | null, mutate: vi.fn(), refetch: vi.fn() }))
vi.mock("@/features/platform/hooks/usePlatform", () => ({
    useMyLegal: () => ({ data: state.data, isPending: false, isError: false, refetch: state.refetch }),
    useAcceptLegal: () => ({ mutate: state.mutate, isPending: false }),
}))
vi.mock("@/components/ui/markdown", () => ({ Markdown: ({ children }: { children: string }) => <div>{children}</div> }))
import { LegalAcceptance } from "@/features/platform/components/LegalAcceptance"

const legal = (version: number) => ({ version, publishedAt: new Date("2026-10-20T12:00:00Z").toISOString(), publishedBy: "a".repeat(24), publishedByName: "Admin", notes: "", termsOfUse: `Termos v${version}`, privacyPolicy: `Privacidade v${version}` })
afterEach(cleanup)
beforeEach(() => {
    vi.clearAllMocks()
    state.data = { current: legal(1), acceptedVersion: null, acceptedAt: null, acceptanceRequired: true }
})

describe("bloqueio de aceite dos termos", () => {
    it("só aceita com a confirmação marcada e envia a versão exibida", async () => {
        const onDone = vi.fn()
        render(<LegalAcceptance onDone={onDone} onLogout={vi.fn()} />)
        expect(screen.getByRole("heading", { name: "Termos de uso e política de privacidade" })).toBeTruthy()
        expect(screen.getByText("Termos v1")).toBeTruthy()
        fireEvent.click(screen.getByRole("tab", { name: "Política de privacidade" }))
        expect(screen.getByText("Privacidade v1")).toBeTruthy()
        const accept = screen.getByRole("button", { name: "Aceitar e continuar" }) as HTMLButtonElement
        expect(accept.disabled).toBe(true)
        fireEvent.click(screen.getByRole("checkbox", { name: /Li e aceito/ }))
        fireEvent.click(accept)
        expect(state.mutate).toHaveBeenCalledWith(1, expect.any(Object))
        ;(state.mutate.mock.calls[0]![1] as { onSuccess: () => void }).onSuccess()
        expect(onDone).toHaveBeenCalled()
    })
    it("nova versão mostra o aviso de atualização; sair continua disponível", () => {
        state.data = { current: legal(2), acceptedVersion: 1, acceptedAt: new Date().toISOString(), acceptanceRequired: true }
        const onLogout = vi.fn()
        render(<LegalAcceptance onDone={vi.fn()} onLogout={onLogout} />)
        expect(screen.getByRole("heading", { name: "Os termos foram atualizados" })).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Sair" }))
        expect(onLogout).toHaveBeenCalled()
    })
    it("sem versão vigente, libera a sessão", async () => {
        state.data = { current: null, acceptedVersion: null, acceptedAt: null, acceptanceRequired: false }
        const onDone = vi.fn()
        render(<LegalAcceptance onDone={onDone} onLogout={vi.fn()} />)
        await waitFor(() => expect(onDone).toHaveBeenCalled())
    })
})
