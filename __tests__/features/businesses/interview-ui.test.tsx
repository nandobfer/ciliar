// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())
const chat = vi.hoisted(() => ({
    messages: [] as unknown[],
    live: null as unknown,
    send: vi.fn(),
    uploads: { items: [] as unknown[], ready: [] as unknown[] },
}))
vi.mock("@/features/opex-agent/hooks/useOpexSessions", () => ({
    useOpexSession: () => ({ isLoading: false, isError: false, data: { session: { status: "idle" }, messages: chat.messages } }),
    useSendOpexMessage: () => ({ mutate: chat.send, isPending: false }),
    useInterruptOpex: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock("@/features/opex-agent/hooks/useOpexStream", () => ({ useOpexStream: () => ({ live: chat.live, settled: null, status: "idle", connected: true }) }))
vi.mock("@/features/opex-agent/hooks/useOpexUploads", () => ({
    useOpexUploads: () => ({ items: chat.uploads.items, ready: chat.uploads.ready, enqueue: vi.fn(), retry: vi.fn(), remove: vi.fn(), clearSent: vi.fn() }),
}))
vi.mock("@/features/opex-agent/components/chat/OpexComposer", () => ({
    OpexComposer: ({ onSend, ariaLabel }: { onSend: (text: string) => void; ariaLabel: string }) => (
        <button type="button" onClick={() => onSend("texto livre")}>
            {ariaLabel}
        </button>
    ),
}))
vi.mock("@/features/businesses/hooks/useBusinesses", () => ({ interviewProgressKey: (id: string) => ["interview", id], useRetryOpening: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock("@tanstack/react-query", async (original) => ({ ...(await original<object>()), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))

import { BusinessDraftCard } from "@/features/businesses/components/interview/BusinessDraftCard"
import { InterviewAnswerControl } from "@/features/businesses/components/interview/InterviewAnswerControl"
import { InterviewWorkspace } from "@/features/businesses/components/interview/InterviewWorkspace"
import type { InterviewProgressDto } from "@/features/businesses/types"

const progress: InterviewProgressDto = {
    id: "a".repeat(24),
    status: "in_progress",
    scriptVersion: 3,
    subtype: "MEI",
    businessId: null,
    canDiscard: false,
    acceptsImage: false,
    startedAt: new Date().toISOString(),
    completedAt: null,
    questions: [
        { field: "name", prompt: "Nome?", required: true, active: true, status: "answered", display: "Studio Aurora", value: "Studio Aurora", current: false },
        { field: "type", prompt: "Tipo?", required: true, active: true, status: "answered", display: "PJ — Pessoa jurídica", value: "PJ", current: false },
        { field: "logo", prompt: "Logo?", required: false, active: true, status: "skipped", display: null, value: null, current: false },
        { field: "segment", prompt: "Área?", required: true, active: true, status: "answered", display: "Fotografia", value: "Fotografia", current: false },
        { field: "links", prompt: "Links?", required: false, active: true, status: "pending", display: null, value: null, current: true },
        { field: "goals", prompt: "Metas?", required: false, active: true, status: "pending", display: null, value: null, current: false },
    ],
}
const logo = { items: [], ready: [], onFiles: vi.fn(), onRetry: vi.fn(), onRemove: vi.fn(), maxImageMb: 5 }
const assistant = (id: string, text: string) => ({ id, role: "assistant", kind: "message", text, files: [], parts: [{ type: "text", text }, { type: "tool", id: "t1", name: "set_segment", group: null, label: "Resposta: Área/segmento", state: "done", input: null, output: null, error: null, confirmation: null, durationMs: 1 }], status: "complete", error: null, usage: null, durationMs: null, model: null, createdAt: new Date().toISOString() })
const user = (id: string, text: string) => ({ id, role: "user", kind: "message", text, files: [], parts: [], status: "complete", error: null, usage: null, durationMs: null, model: null, createdAt: new Date().toISOString() })

beforeEach(() => {
    vi.clearAllMocks()
    chat.messages = []
    chat.live = null
})
afterEach(cleanup)

describe("ficha do negócio sendo montada", () => {
    it("mostra valores, subtipo, pulada, a atual e o progresso; respostas abrem a correção", () => {
        const onEdit = vi.fn()
        render(<BusinessDraftCard progress={progress} onEdit={onEdit} />)
        const card = screen.getByRole("complementary", { name: "Ficha do negócio" })
        expect(within(card).getByText("Studio Aurora")).toBeTruthy()
        expect(within(card).getByText("PJ — Pessoa jurídica · MEI")).toBeTruthy()
        expect(within(card).getByText("4 de 6")).toBeTruthy()
        expect(within(card).getByText("agora")).toBeTruthy()
        expect(within(card).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("4")
        fireEvent.click(within(card).getByRole("button", { name: /Corrigir Área\/segmento/ }))
        expect(onEdit).toHaveBeenCalledWith("segment")
        expect(within(card).queryByRole("button", { name: /Corrigir Site e redes sociais/ })).toBeNull()
        expect(within(card).getByRole("button", { name: /Corrigir Logo\/foto/ })).toBeTruthy()
    })

    it("resposta gravada ganha o \"✓ salvo\"", () => {
        const view = render(<BusinessDraftCard progress={progress} />)
        expect(screen.queryByText("salvo")).toBeNull()
        const next = { ...progress, questions: progress.questions.map((question) => (question.field === "links" ? { ...question, status: "answered" as const, display: "https://aurora.com", value: ["https://aurora.com"], current: false } : question)) }
        view.rerender(<BusinessDraftCard progress={next} />)
        expect(screen.getByText("salvo")).toBeTruthy()
    })
})

describe("controles das perguntas", () => {
    it("tipo: escolhe PJ, informa o enquadramento e envia o texto", () => {
        const onSubmit = vi.fn()
        render(<InterviewAnswerControl field="type" value={null} subtype={null} currency="BRL" required disabled={false} onSubmit={onSubmit} logo={logo} />)
        fireEvent.click(screen.getByRole("button", { name: /Continuar/ }))
        expect(onSubmit).not.toHaveBeenCalled()
        expect(screen.getByRole("alert").textContent).toMatch(/PF/)
        fireEvent.click(screen.getByRole("radio", { name: /Pessoa jurídica/ }))
        fireEvent.change(screen.getByLabelText("Enquadramento (opcional)"), { target: { value: "MEI" } })
        fireEvent.click(screen.getByRole("button", { name: /Continuar/ }))
        expect(onSubmit).toHaveBeenCalledWith("Pessoa jurídica (PJ), MEI")
    })

    it("disponibilidade por dias; links com validação; pular só nas opcionais", () => {
        const onSubmit = vi.fn()
        const onSkip = vi.fn()
        const view = render(<InterviewAnswerControl field="availability" value={null} subtype={null} currency="BRL" required={false} disabled={false} onSubmit={onSubmit} onSkip={onSkip} logo={logo} />)
        fireEvent.click(screen.getByRole("button", { name: "Segunda" }))
        fireEvent.click(screen.getByRole("button", { name: "Sábado" }))
        fireEvent.click(screen.getByRole("button", { name: /Continuar/ }))
        expect(onSubmit).toHaveBeenCalledWith("Segunda, Sábado")
        fireEvent.click(screen.getByRole("button", { name: /Pular/ }))
        expect(onSkip).toHaveBeenCalled()
        view.unmount()
        render(<InterviewAnswerControl field="links" value={["aurora.com"]} subtype={null} currency="BRL" required disabled={false} onSubmit={onSubmit} onSkip={onSkip} logo={logo} />)
        expect(screen.queryByRole("button", { name: /Pular/ })).toBeNull()
        fireEvent.click(screen.getByRole("button", { name: /Adicionar link/ }))
        fireEvent.change(screen.getByLabelText("Link 2"), { target: { value: "nao e url" } })
        fireEvent.click(screen.getByRole("button", { name: /Continuar/ }))
        expect(screen.getByRole("alert").textContent).toBe("URL inválida")
        fireEvent.change(screen.getByLabelText("Link 2"), { target: { value: "instagram.com/aurora" } })
        fireEvent.click(screen.getByRole("button", { name: /Continuar/ }))
        expect(onSubmit).toHaveBeenLastCalledWith("aurora.com; instagram.com/aurora")
    })

    it("logo: Continuar só com a imagem enviada", () => {
        const onSubmit = vi.fn()
        const view = render(<InterviewAnswerControl field="logo" value={null} subtype={null} currency="BRL" required={false} disabled={false} onSubmit={onSubmit} onSkip={vi.fn()} logo={logo} />)
        expect((screen.getByRole("button", { name: /Continuar/ }) as HTMLButtonElement).disabled).toBe(true)
        expect((screen.getByRole("button", { name: /Pular/ }) as HTMLButtonElement).disabled).toBe(false)
        view.unmount()
        const done = { localId: "l1", name: "logo.png", status: "done", previewUrl: null, progress: 100, error: null, uploaded: { id: "f1" } }
        render(<InterviewAnswerControl field="logo" value={null} subtype={null} currency="BRL" required={false} disabled={false} onSubmit={onSubmit} logo={{ ...logo, items: [done] as never, ready: [done] as never }} />)
        fireEvent.click(screen.getByRole("button", { name: /Continuar/ }))
        expect(onSubmit).toHaveBeenCalledWith("Esta é a imagem do negócio (logo/foto).", true)
    })
})

describe("pergunta em foco", () => {
    it("a fala atual vira o texto da página, sem balões nem cards de ferramenta; Continuar envia a mensagem", () => {
        chat.messages = [assistant("m1", "Perfeito! O negócio tem site ou redes sociais?")]
        render(<InterviewWorkspace progress={progress} maxImageMb={5} />)
        expect(screen.getByText("Perfeito! O negócio tem site ou redes sociais?")).toBeTruthy()
        expect(screen.getByText(/Pergunta 5 de 6 · Site e redes sociais/)).toBeTruthy()
        expect(screen.queryByText("Resposta: Área/segmento")).toBeNull()
        fireEvent.change(screen.getByLabelText("Link 1"), { target: { value: "aurora.com" } })
        fireEvent.click(screen.getByRole("button", { name: /Continuar/ }))
        expect(chat.send).toHaveBeenCalledWith({ text: "aurora.com", files: [] }, expect.anything())
        fireEvent.click(screen.getByRole("button", { name: /Pular/ }))
        expect(chat.send).toHaveBeenLastCalledWith({ text: "Quero pular esta pergunta.", files: [] }, expect.anything())
    })

    it("corrigir pela ficha envia \"Quero corrigir\"; texto livre continua; \"Ver conversa\" mostra a transcrição", () => {
        chat.messages = [assistant("m1", "Qual é a área?"), user("u1", "Fotografia"), assistant("m2", "E os links?")]
        render(<InterviewWorkspace progress={progress} maxImageMb={5} />)
        expect(screen.getAllByText(/Você respondeu:/)[0]!.parentElement?.textContent).toContain("Fotografia")
        fireEvent.click(screen.getAllByRole("button", { name: /Corrigir Área\/segmento/ })[0]!)
        expect(screen.getByText(/Corrigindo · Área\/segmento/)).toBeTruthy()
        const input = screen.getByLabelText("Área ou segmento") as HTMLInputElement
        expect(input.value).toBe("Fotografia")
        fireEvent.change(input, { target: { value: "Fotografia de eventos" } })
        fireEvent.click(screen.getByRole("button", { name: /Corrigir$/ }))
        expect(chat.send).toHaveBeenCalledWith({ text: "Quero corrigir Área/segmento: Fotografia de eventos", files: [] }, expect.anything())
        fireEvent.click(screen.getByRole("button", { name: "Resposta livre para o Agente Entrevistador" }))
        expect(chat.send).toHaveBeenLastCalledWith({ text: "texto livre", files: [] }, expect.anything())
        fireEvent.click(screen.getByRole("button", { name: /Ver conversa/ }))
        const transcript = screen.getByRole("list", { name: "Transcrição da entrevista" })
        expect(within(transcript).getAllByText("Entrevistador")).toHaveLength(2)
        expect(within(transcript).getByText("Fotografia")).toBeTruthy()
    })
})
