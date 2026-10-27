// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("framer-motion", () => ({
    useReducedMotion: () => true,
    AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
    motion: { div: ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div> },
}))
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock("@/lib/api", () => ({ api, apiErrorMessage: () => "Erro", unwrapApi: (value: unknown) => value }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => <a href={href} {...props}>{children}</a> }))

import { newBlock, type PortfolioBlock } from "@/features/portfolio/blocks"
import { PublicPortfolioPage } from "@/features/portfolio/components/PublicPortfolioPage"
import { PortfolioEditor } from "@/features/portfolio/components/editor/PortfolioEditor"
import type { ResolvedFile } from "@/features/portfolio/resolve"
import type { PortfolioDto, PublicPortfolioDto } from "@/features/portfolio/types"

const ID = "a".repeat(24)
const S1 = "1".repeat(24)
const business = { name: "Studio", description: "Marcas e sites", segment: "Design", logoUrl: null, links: ["https://studio.example"], contactEmail: "studio@example.test", contactPhone: "(11) 99999-0000", whatsappUrl: "https://wa.me/5511999990000", theme: { primaryColor: "#FF6600", mode: "light" as const } }
const file = (id: string, kind: ResolvedFile["kind"], suffix = "1"): ResolvedFile => ({ id, name: `${id}.${kind === "pdf" ? "pdf" : "png"}`, mediaType: kind === "pdf" ? "application/pdf" : "image/png", size: 2048, kind, viewUrl: `https://s3.local/${id}?view=${suffix}`, downloadUrl: `https://s3.local/${id}?download=${suffix}` })
const style = { background: "none" as const, spacing: "md" as const, align: "left" as const }

const page = (expiresAt: string, suffix = "1"): PublicPortfolioDto => ({
    slug: "studio",
    indexable: false,
    business,
    blocks: [
        { id: "b1", style, type: "heading", text: "Nossos trabalhos", level: 2 },
        { id: "b2", style, type: "section", source: "successes", title: "Sucessos", layout: "grid", columns: 2, missing: 0, cards: [{ source: "successes", id: S1, title: "Nova marca", description: null, date: "2026-05-02", result: "+30%", client: "Cliente confidencial", images: [file("img", "image", suffix)] }] },
        { id: "b3", style, type: "text", markdown: "Texto com **negrito** e <script>alert(1)</script> [link](javascript:alert(1))" },
        { id: "b4", style, type: "section", source: "documents", title: "Documentos", layout: "list", columns: 2, missing: 0, cards: [{ source: "documents", id: "d1", name: "Apresentação", description: null, file: file("doc", "pdf", suffix) }] },
        { id: "b5", style, type: "button", label: "Fale comigo", action: "whatsapp", href: "https://wa.me/5511999990000", variant: "solid" },
    ],
    urlsExpireAt: expiresAt,
})

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
})

describe("portfólio público", () => {
    it("aplica o tema, mostra os blocos na ordem, cliente confidencial, PDF na página, texto restrito e o contato no fim", () => {
        render(<PublicPortfolioPage initial={page("2999-01-01T00:00:00Z")} error={null} />)
        expect(document.documentElement.classList.contains("dark")).toBe(false)
        expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Nossos trabalhos", "Sucessos", "Documentos"])
        expect(screen.getByText("Cliente confidencial")).toBeTruthy()
        expect(screen.getByTitle("Apresentação").getAttribute("src")).toBe("https://s3.local/doc?view=1")
        expect(screen.getByText("negrito").tagName).toBe("STRONG")
        expect(document.querySelector("script")).toBeNull()
        expect(screen.getByText("link").getAttribute("href")).toBeFalsy()
        expect(screen.getByRole("link", { name: /Fale comigo/ }).getAttribute("href")).toBe("https://wa.me/5511999990000")
        expect(screen.getByRole("link", { name: /studio@example.test/ }).getAttribute("href")).toBe("mailto:studio@example.test")
        expect(document.querySelector("form")).toBeNull()
    })

    it("com as URLs vencidas, relê o portfólio antes de baixar e abre a URL nova", async () => {
        const tab = { opener: {}, location: { href: "" }, close: vi.fn() }
        const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window)
        api.get.mockResolvedValue({ data: page("2999-01-01T00:00:00Z", "2") })
        render(<PublicPortfolioPage initial={page("2000-01-01T00:00:00Z")} error={null} />)
        await act(async () => {
            fireEvent.click(screen.getByRole("link", { name: /Baixar/ }))
        })
        expect(api.get).toHaveBeenCalledWith("/public/portfolio/studio")
        expect(open).toHaveBeenCalled()
        expect(tab.opener).toBeNull()
        expect(tab.location.href).toBe("https://s3.local/doc?download=2")
    })

    it("erro (ex.: limite de taxa) mostra indisponível", () => {
        render(<PublicPortfolioPage initial={null} error="Muitas tentativas. Aguarde e tente novamente." />)
        expect(screen.getByText("Portfólio indisponível")).toBeTruthy()
    })
})

const editorDto = (blocks: PortfolioBlock[], overrides: Partial<PortfolioDto> = {}): PortfolioDto => ({
    businessId: ID,
    slug: "studio",
    url: "http://localhost/p/studio",
    published: false,
    publishedAt: null,
    indexable: false,
    version: 0,
    draft: { blocks, version: 1, updatedAt: null },
    live: { blocks: [], number: 0, publishedAt: null },
    hasChanges: true,
    needsTemplate: false,
    problems: [],
    pool: { services: [{ id: ID, name: "Design", description: null, createdAt: "2026-01-01T00:00:00Z" }], successes: [{ id: S1, title: "Nova marca", description: null, date: null, result: null, clientName: "Padaria", images: [], createdAt: "2026-01-01T00:00:00Z" }], documents: [], items: [] },
    unavailable: { services: 0, successes: 0, documents: 0, items: 0 },
    media: [],
    business,
    contactEmailIsAccount: false,
    businessStatus: "active",
    editable: true,
    canPublish: true,
    ...overrides,
})

function renderEditor(dto: PortfolioDto) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={client}>
            <PortfolioEditor portfolio={dto} />
        </QueryClientProvider>,
    )
}

describe("editor do portfólio", () => {
    beforeEach(() => {
        let version = 1
        api.put.mockImplementation(async (_url: string, body: { blocks: PortfolioBlock[] }) => ({ data: { draftVersion: ++version, updatedAt: new Date().toISOString(), hasChanges: true, problems: [], blocks: body.blocks } }))
    })

    it("clicar num bloco da biblioteca insere na página, salva sozinho e Desfazer volta", async () => {
        renderEditor(editorDto([newBlock("heading", { text: "Primeiro" })]))
        const library = screen.getAllByLabelText("Blocos, conteúdo e página")[0]!
        fireEvent.click(within(library).getByRole("button", { name: /^Texto/ }))
        expect(screen.getAllByRole("group", { name: /Texto/ }).length).toBeGreaterThan(0)
        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1), { timeout: 3000 })
        const [url, body] = api.put.mock.calls[0]!
        expect(url).toBe(`/businesses/${ID}/portfolio/draft`)
        expect((body as { blocks: PortfolioBlock[]; draftVersion: number }).blocks.map((block) => block.type)).toEqual(["heading", "text"])
        expect((body as { draftVersion: number }).draftVersion).toBe(1)
        fireEvent.click(screen.getByRole("button", { name: /Desfazer/ }))
        expect(screen.queryAllByRole("group", { name: /^Texto/ })).toHaveLength(0)
    })

    it("seleciona pelo teclado, mostra as propriedades, Delete exclui e Ctrl+Z restaura; conteúdo vira destaque", () => {
        renderEditor(editorDto([newBlock("heading", { text: "Olá" })]))
        const block = screen.getByRole("group", { name: /Título: Olá/ })
        fireEvent.keyDown(block, { key: "Enter" })
        expect(block.getAttribute("aria-current")).toBe("true")
        expect(screen.getAllByLabelText("Texto do título")[0]).toBeTruthy()
        fireEvent.keyDown(window, { key: "Delete" })
        expect(screen.queryByRole("group", { name: /Título: Olá/ })).toBeNull()
        fireEvent.keyDown(window, { key: "z", ctrlKey: true })
        expect(screen.getByRole("group", { name: /Título: Olá/ })).toBeTruthy()
        const library = screen.getAllByLabelText("Blocos, conteúdo e página")[0]!
        fireEvent.click(within(library).getByRole("tab", { name: "Conteúdo" }))
        fireEvent.click(within(library).getByRole("button", { name: "Inserir em destaque: Nova marca" }))
        expect(screen.getByRole("group", { name: /Item em destaque \(sucesso\)/ })).toBeTruthy()
        expect(screen.getAllByText("Nova marca").length).toBeGreaterThan(0)
    })

    it("primeira abertura oferece os modelos; problemas bloqueiam publicar; somente leitura sem barra de edição", () => {
        const view = renderEditor(editorDto([], { needsTemplate: true, draft: { blocks: [], version: 0, updatedAt: null } }))
        expect(screen.getByText("Como você quer começar?")).toBeTruthy()
        fireEvent.click(screen.getByRole("radio", { name: /Minimalista/ }))
        fireEvent.click(screen.getByRole("button", { name: "Usar este modelo" }))
        expect(screen.getAllByRole("group", { name: /Seção: Serviços|Botão/ }).length).toBe(2)
        view.unmount()

        const image = newBlock("image")
        renderEditor(editorDto([image], { problems: [{ blockId: image.id, message: "Imagem sem arquivo: escolha uma imagem da mídia" }] }))
        expect(screen.getByRole("button", { name: /1 problema/ })).toBeTruthy()
        expect((screen.getByRole("button", { name: "Publicar página" }) as HTMLButtonElement).disabled).toBe(true)
        cleanup()

        renderEditor(editorDto([newBlock("heading", { text: "Leitura" })], { editable: false, canPublish: false }))
        expect(screen.queryByRole("button", { name: /Desfazer/ })).toBeNull()
        expect(screen.queryByRole("button", { name: "Publicar página" })).toBeNull()
        fireEvent.click(screen.getByRole("group", { name: /Título: Leitura/ }))
        expect(screen.queryByRole("button", { name: "Excluir bloco" })).toBeNull()
    })
})
