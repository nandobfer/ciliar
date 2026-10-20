// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }))
vi.mock("sonner", () => ({ toast }))
const net = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock("@/lib/api", () => ({
    api: net,
    unwrapApi: (response: { data: unknown }) => response.data,
    apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}))

import { MemoryList } from "@/features/ai/components/memories/MemoryList"
import { agentMemoriesSource } from "@/features/ai/hooks/useMemories"

const memory = { id: "a".repeat(24), texto: "Responda sempre em pt-BR.", resumo: "Idioma pt-BR", autor: "Admin", criadaEm: new Date().toISOString(), atualizadaEm: new Date().toISOString() }
const mount = (canEdit: boolean) =>
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryList source={agentMemoriesSource("opex-agent")} canEdit={canEdit} emptyTitle="Nenhuma memória" />
        </QueryClientProvider>,
    )

beforeEach(() => {
    vi.clearAllMocks()
    net.get.mockResolvedValue({ data: { data: [memory] } })
})
afterEach(cleanup)

describe("lista de memórias", () => {
    it("mostra o resumo, expande o texto e lê da rota do agente", async () => {
        mount(true)
        fireEvent.click(await screen.findByRole("button", { name: /Idioma pt-BR/ }))
        expect(screen.getByText("Responda sempre em pt-BR.")).toBeTruthy()
        expect(net.get).toHaveBeenCalledWith("/ai/agents/opex-agent/memories")
    })

    it("criar entra na hora (otimista) e avisa quando o Resumo está indisponível", async () => {
        let resolve: (value: unknown) => void = () => undefined
        net.post.mockReturnValue(new Promise((done) => (resolve = done)))
        mount(true)
        fireEvent.click(await screen.findByRole("button", { name: /Nova memória/ }))
        fireEvent.change(screen.getByLabelText("Nova memória"), { target: { value: "Nova regra" } })
        await waitFor(() => expect((screen.getByRole("button", { name: /Salvar/ }) as HTMLButtonElement).disabled).toBe(false))
        fireEvent.click(screen.getByRole("button", { name: /Salvar/ }))
        expect(await screen.findByLabelText("Resumindo a memória")).toBeTruthy()
        await waitFor(() => expect(net.post).toHaveBeenCalledWith("/ai/agents/opex-agent/memories", { texto: "Nova regra" }))
        resolve({ data: { data: { memoria: { ...memory, id: "b".repeat(24), texto: "Nova regra", resumo: "Nova regra" }, formatadaPorIa: false } } })
        await waitFor(() => expect(toast.warning).toHaveBeenCalled())
    })

    it("excluir pede confirmação; sem edição a lista é somente leitura", async () => {
        net.delete.mockResolvedValue({ data: { data: memory } })
        const view = mount(true)
        fireEvent.click(await screen.findByRole("button", { name: "Excluir memória" }))
        expect(screen.getByText('"Idioma pt-BR" deixa de ser usada pelo agente.')).toBeTruthy()
        fireEvent.click(screen.getAllByRole("button", { name: "Excluir memória" }).at(-1)!)
        await waitFor(() => expect(net.delete).toHaveBeenCalledWith(`/ai/agents/opex-agent/memories/${memory.id}`))
        view.unmount()
        mount(false)
        await screen.findByRole("button", { name: /Idioma pt-BR/ })
        expect(screen.queryByRole("button", { name: /Nova memória/ })).toBeNull()
        expect(screen.queryByRole("button", { name: "Editar memória" })).toBeNull()
    })
})
