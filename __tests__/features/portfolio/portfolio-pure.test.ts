import { describe, expect, it } from "vitest"
import { routePermissions, requiresPanel } from "@/features/access/server/policy"
import { BUSINESS_ITEM_KINDS, BUSINESS_ITEM_PATHS, BUSINESS_SPACE_SECTIONS } from "@/features/businesses/constants"
import { RETENTION_TYPES } from "@/features/platform/constants"
import { OPEX_NO_PANEL_GROUPS, OPEX_TOOL_CATALOG } from "@/features/opex-agent/tool-catalog"
import { businessSpaceNavSection } from "@/features/businesses/components/space/space-nav"
import {
    addSectionPick,
    countBlocks,
    dropProblem,
    duplicateBlock,
    findBlock,
    insertBlock,
    mediaIdsOf,
    moveBlock,
    newBlock,
    portfolioBlocksSchema,
    PORTFOLIO_BLOCKS_MAX,
    pruneContentRef,
    pruneMediaRef,
    publishProblems,
    removeBlock,
    setColumnRatio,
    shiftBlock,
    type PortfolioBlock,
} from "@/features/portfolio/blocks"
import { pushHistory, redoHistory, startHistory, undoHistory, UNDO_LIMIT } from "@/features/portfolio/editor-history"
import { normalizeTags, orderedIds, slugCandidates, slugify, slugProblem, whatsappUrl } from "@/features/portfolio/logic"
import { buttonHref, publicBlocks, publicFileKind, referencedFiles, resolveBlocks, sectionEntries, type ContentPool, type PoolFile } from "@/features/portfolio/resolve"
import { portfolioDraftSaveSchema, portfolioItemCreateSchema, portfolioSlugUpdateSchema } from "@/features/portfolio/schemas"
import { blocksFromLegacy, buildTemplate } from "@/features/portfolio/templates"

const ID = "a".repeat(24)
const S1 = "1".repeat(24)
const S2 = "2".repeat(24)
const M1 = "c".repeat(24)

describe("slug", () => {
    it("normaliza o nome, recusa formato inválido e reservados e sugere alternativas únicas", () => {
        expect(slugify("  Studio Ágil & Cia.  ")).toBe("studio-agil-cia")
        expect(slugProblem("studio-agil")).toBeNull()
        for (const bad of ["ab", "Studio", "-studio", "studio-", "stu--dio", "stúdio", "a".repeat(61)]) expect(slugProblem(bad)).toBe("format")
        for (const reserved of ["admin", "api", "login", "orcamento", "negocios", "p"]) expect(slugProblem(reserved)).not.toBeNull()
        expect(slugCandidates("Studio", 1).slice(0, 3)).toEqual(["studio", "studio-2", "studio-3"])
        expect(slugCandidates("Admin", 2)[0]).toBe("negocio-admin")
        expect(slugCandidates("!!", 7)[0]).toBe("negocio-7")
        expect(portfolioSlugUpdateSchema.safeParse({ slug: " Meu-Site ", version: 0 }).data?.slug).toBe("meu-site")
        expect(portfolioSlugUpdateSchema.safeParse({ slug: "login", version: 0 }).success).toBe(false)
    })
})

describe("blocos", () => {
    it("novos blocos são válidos; colunas aceitam só blocos simples (um nível) e até 6", () => {
        const columns = newBlock("columns")
        let blocks: PortfolioBlock[] = [newBlock("heading"), columns, newBlock("section", { source: "services" })]
        expect(portfolioBlocksSchema.safeParse(blocks).success).toBe(true)
        expect(dropProblem(blocks, "section", { parentId: columns.id, column: 0, index: 0 })).toMatch(/não pode ficar dentro de colunas/)
        expect(dropProblem(blocks, "columns", { parentId: columns.id, column: 0, index: 0 })).not.toBeNull()
        for (let index = 0; index < 6; index += 1) blocks = insertBlock(blocks, newBlock("text"), { parentId: columns.id, column: 1, index })
        expect(dropProblem(blocks, "text", { parentId: columns.id, column: 1, index: 0 })).toMatch(/Até 6/)
        expect(countBlocks(blocks)).toBe(9)
        // Colunas aninhadas são recusadas pelo esquema.
        const nested = { ...columns, columns: [[newBlock("columns")], []] }
        expect(portfolioBlocksSchema.safeParse([nested]).success).toBe(false)
        expect(portfolioBlocksSchema.safeParse([{ ...columns, ratio: "33-33-33" }]).success).toBe(false)
    })

    it("move entre a página e as colunas, sobe/desce, duplica com ids novos e remove", () => {
        const a = newBlock("heading", { text: "A" })
        const b = newBlock("text")
        const columns = newBlock("columns")
        let blocks: PortfolioBlock[] = [a, b, columns]
        blocks = moveBlock(blocks, a.id, { parentId: null, index: 3 })
        expect(blocks.map((block) => block.id)).toEqual([b.id, columns.id, a.id])
        blocks = moveBlock(blocks, a.id, { parentId: columns.id, column: 1, index: 0 })
        expect(blocks).toHaveLength(2)
        expect((findBlock(blocks, columns.id) as typeof columns).columns[1]!.map((child) => child.id)).toEqual([a.id])
        // Colunas não entram em si mesmas.
        expect(moveBlock(blocks, columns.id, { parentId: columns.id, column: 0, index: 0 })).toEqual(blocks)
        blocks = shiftBlock(blocks, b.id, 1)
        expect(blocks.map((block) => block.id)).toEqual([columns.id, b.id])
        const copy = duplicateBlock(blocks, columns.id)
        expect(copy.id).not.toBe(columns.id)
        const duplicated = findBlock(copy.blocks, copy.id!) as typeof columns
        expect(duplicated.columns[1]![0]!.id).not.toBe(a.id)
        expect(portfolioBlocksSchema.safeParse(copy.blocks).success).toBe(true)
        expect(removeBlock(copy.blocks, a.id).length).toBe(3)
        expect(findBlock(removeBlock(copy.blocks, a.id), a.id)).toBeNull()
    })

    it("proporção das colunas (3 → 2 junta a última), seção escolhe um a um, referências de mídia e conteúdo", () => {
        const three = setColumnRatio(newBlock("columns"), "33-33-33")
        const filled = { ...three, columns: [[], [newBlock("text")], [newBlock("separator")]] }
        expect(setColumnRatio(filled, "50-50").columns[1]).toHaveLength(2)
        const section = addSectionPick(newBlock("section", { source: "successes" }), S1)
        expect(section).toMatchObject({ mode: "picked", picks: [{ id: S1, showClient: false }] })
        expect(addSectionPick(section, S1).picks).toHaveLength(1)
        const image = newBlock("image", { mediaId: M1 })
        const blocks: PortfolioBlock[] = [image, newBlock("gallery", { mediaIds: [M1] }), section, newBlock("featured", { source: "successes", refId: S1 })]
        expect(mediaIdsOf(blocks)).toEqual([M1])
        expect(mediaIdsOf(pruneMediaRef(blocks, M1))).toEqual([])
        const pruned = pruneContentRef(blocks, "successes", S1)
        expect(pruned).toHaveLength(3)
        expect((pruned[2] as typeof section).picks).toEqual([])
    })

    it("o rascunho aceita incompletos; publicar exige título, imagem com texto alternativo, link válido e depoimento completo", () => {
        const blocks: PortfolioBlock[] = [newBlock("heading", { text: " " }), newBlock("image"), newBlock("image", { mediaId: M1 }), newBlock("button", { action: "link", url: "javascript:alert(1)" }), newBlock("testimonial", { quote: "Ótimo" })]
        expect(portfolioDraftSaveSchema.safeParse({ blocks, draftVersion: 0 }).success).toBe(true)
        expect(publishProblems(blocks).map((problem) => problem.message)).toEqual([
            "Título vazio",
            "Imagem sem arquivo: escolha uma imagem da mídia",
            "Imagem sem texto alternativo (descrição para quem não enxerga a imagem)",
            "Botão de link sem endereço válido (https://…)",
            "Depoimento sem citação ou sem autor",
        ])
        expect(portfolioBlocksSchema.safeParse(Array.from({ length: PORTFOLIO_BLOCKS_MAX + 1 }, () => newBlock("separator"))).success).toBe(false)
    })

    it("desfazer/refazer com limite e junção das alterações seguidas do mesmo campo", () => {
        let history = startHistory<number[]>([])
        history = pushHistory(history, [1], { key: "t", now: 0 })
        history = pushHistory(history, [1, 2], { key: "t", now: 500 })
        expect(history.past).toHaveLength(1)
        history = pushHistory(history, [1, 2, 3], { key: "t", now: 2000 })
        expect(history.past).toHaveLength(2)
        history = undoHistory(history)
        expect(history.present).toEqual([1, 2])
        history = redoHistory(history)
        expect(history.present).toEqual([1, 2, 3])
        for (let index = 0; index < UNDO_LIMIT + 10; index += 1) history = pushHistory(history, [index])
        expect(history.past).toHaveLength(UNDO_LIMIT)
    })
})

describe("exibição dos blocos", () => {
    const image: PoolFile = { id: "f1", name: "foto.png", mediaType: "image/png", size: 10 }
    const pdf: PoolFile = { id: "f2", name: "rel.pdf", mediaType: "application/pdf", size: 10 }
    const pool: ContentPool = {
        services: [{ id: ID, name: "Design", description: null, createdAt: "2026-01-01T00:00:00Z" }],
        successes: [
            { id: S1, title: "Nova marca", description: null, date: "2026-03-01", result: "+30%", clientName: "Padaria Sol", images: [image, pdf], createdAt: "2026-03-01T00:00:00Z" },
            { id: S2, title: "Antigo", description: null, date: "2025-01-01", result: null, clientName: null, images: [], createdAt: "2025-01-01T00:00:00Z" },
        ],
        documents: [],
        items: [],
    }
    const files = (file: PoolFile) => ({ ...file, kind: publicFileKind(file.mediaType), viewUrl: `v/${file.id}`, downloadUrl: `d/${file.id}` })
    const contact = { email: "a@b.test", phone: null, whatsappUrl: null }

    it("seção escolhida em ordem conta os indisponíveis; 'todos' acompanha o conteúdo e ordena", () => {
        expect(sectionEntries({ source: "successes", mode: "picked", picks: [{ id: S2, showClient: false }, { id: "9".repeat(24), showClient: false }, { id: S1, showClient: true }], sort: "manual", limit: null, showClient: false }, pool)).toMatchObject({ missing: 1, entries: [{ entry: { id: S2 } }, { entry: { id: S1 }, showClient: true }] })
        expect(sectionEntries({ source: "successes", mode: "all", picks: [], sort: "oldest", limit: 1, showClient: false }, pool).entries.map(({ entry }) => entry.id)).toEqual([S2])
    })

    it("cliente confidencial por padrão, só imagens dos sucessos, botões pelo contato e a página pública sem vazios", () => {
        const blocks: PortfolioBlock[] = [
            newBlock("section", { source: "successes", mode: "picked", picks: [{ id: S1, showClient: false }] }),
            newBlock("featured", { source: "successes", refId: S1, showClient: true }),
            newBlock("featured", { source: "services", refId: "9".repeat(24) }),
            newBlock("button", { action: "whatsapp" }),
            newBlock("button", { action: "email", label: "E-mail" }),
            newBlock("image", { mediaId: M1, alt: "x" }),
            newBlock("text", { markdown: "" }),
        ]
        const resolved = resolveBlocks(blocks, pool, new Map(), files, contact)
        expect(resolved[0]).toMatchObject({ type: "section", cards: [{ title: "Nova marca", client: "Cliente confidencial", images: [{ id: "f1" }] }] })
        expect(resolved[1]).toMatchObject({ type: "featured", card: { client: "Padaria Sol" } })
        expect(resolved[2]).toMatchObject({ type: "featured", card: null })
        expect(resolved[3]).toMatchObject({ type: "button", href: null })
        expect(resolved[4]).toMatchObject({ type: "button", href: "mailto:a@b.test" })
        expect(publicBlocks(resolved).map((block) => block.type)).toEqual(["section", "featured", "button"])
        expect(referencedFiles(publicBlocks(resolved)).map((file) => file.id)).toEqual(["f1"])
        expect(buttonHref("link", "https://site.example/x", contact)).toBe("https://site.example/x")
        expect(buttonHref("phone", "", { ...contact, phone: "(11) 9999-0000" })).toBe("tel:1199990000")
    })

    it("modelos montam com o conteúdo disponível; o portfólio antigo vira seções escolhidas", () => {
        const counts = { services: 1, successes: 2, documents: 0, items: 0 }
        const classic = buildTemplate("classic", { description: "Sobre nós", counts, firstSuccessId: S1, hasPhone: true })
        expect(classic.map((block) => (block.type === "section" ? `section:${block.source}` : block.type))).toEqual(["heading", "text", "section:services", "section:successes", "separator", "button"])
        expect(classic.at(-1)).toMatchObject({ action: "whatsapp" })
        expect(buildTemplate("showcase", { description: null, counts, firstSuccessId: S1, hasPhone: false })[0]).toMatchObject({ type: "featured", refId: S1 })
        expect(buildTemplate("blank", { description: null, counts, firstSuccessId: null, hasPhone: false })).toEqual([])
        expect(portfolioBlocksSchema.safeParse(classic).success).toBe(true)
        const legacy = blocksFromLegacy({ sections: [{ key: "documents", visible: false }, { key: "successes", visible: true }], successes: [{ id: S1, showClient: true }], services: [ID], documents: [S2], items: [] })
        expect(legacy.map((block) => block.type === "section" && [block.source, block.mode, block.picks])).toEqual([
            ["successes", "picked", [{ id: S1, showClient: true }]],
            ["services", "picked", [{ id: ID, showClient: false }]],
        ])
        expect(orderedIds(["b", "gone", "a"], ["n", "a", "b"])).toEqual(["b", "a", "n"])
    })

    it("tipo do arquivo, WhatsApp e tags", () => {
        expect(publicFileKind("image/svg+xml")).toBe("file")
        expect(publicFileKind("application/pdf")).toBe("pdf")
        expect(whatsappUrl("(11) 99999-0000")).toBe("https://wa.me/5511999990000")
        expect(whatsappUrl("123")).toBeNull()
        expect(normalizeTags(["Sites", " sítes ", "", "Apps"])).toEqual(["Sites", "Apps"])
        expect(portfolioItemCreateSchema.safeParse({ title: "X", url: "ftp://x" }).success).toBe(false)
    })
})

describe("rotas, navegação e catálogo", () => {
    it("rotas do editor: leitura no serviço, rascunho/mídia com a edição, publicar/endereço/indexação com a publicação", () => {
        const base = `/api/businesses/${ID}`
        expect(routePermissions(`${base}/portfolio`, "GET")).toEqual([])
        expect(routePermissions(`${base}/portfolio`, "PATCH")).toEqual(["businesses.use", "portfolio.publish"])
        for (const tail of ["publish", "unpublish", "slug", "publish-changes"]) expect(routePermissions(`${base}/portfolio/${tail}`, "POST")).toEqual(["businesses.use", "portfolio.publish"])
        for (const tail of ["discard-draft", "template", "history/3/restore", "media"]) expect(routePermissions(`${base}/portfolio/${tail}`, "POST")).toEqual(["businesses.use", "portfolio.edit"])
        expect(routePermissions(`${base}/portfolio/draft`, "PUT")).toEqual(["businesses.use", "portfolio.edit"])
        expect(routePermissions(`${base}/portfolio/media/${ID}`, "DELETE")).toEqual(["businesses.use", "portfolio.edit"])
        expect(routePermissions(`${base}/portfolio/history`, "GET")).toEqual([])
        expect(routePermissions(`${base}/portfolio/preview`, "GET")).toEqual([])
        expect(routePermissions(`${base}/portfolio-items/${ID}/archive`, "POST")).toEqual(["businesses.use", "portfolio.edit"])
        expect(() => routePermissions(`${base}/portfolio/outra`, "GET")).toThrow()
        expect(requiresPanel(`${base}/portfolio`)).toBe(false)
    })
    it("item Portfólio na barra do espaço; itens avulsos com prazo próprio; ferramentas do editor no catálogo sem painel", () => {
        expect(BUSINESS_SPACE_SECTIONS.at(-1)).toEqual({ slug: "portfolio", label: "Portfólio" })
        expect(businessSpaceNavSection(ID).items.at(-1)).toMatchObject({ href: `/negocios/${ID}/portfolio`, label: "Portfólio" })
        expect(BUSINESS_ITEM_KINDS).toContain("portfolioItems")
        expect(RETENTION_TYPES).toContain("portfolioItems")
        expect(BUSINESS_ITEM_PATHS.portfolioItems).toBe("portfolio-items")
        const tools = OPEX_TOOL_CATALOG.filter((tool) => tool.group === "portfolio" || tool.group === "portfolio-items")
        expect(Object.fromEntries(tools.map((tool) => [tool.name, tool.risk]))).toEqual({
            get_portfolio_page: "read",
            add_portfolio_block: "write",
            update_portfolio_block: "write",
            move_portfolio_block: "write",
            remove_portfolio_block: "destructive",
            apply_portfolio_template: "destructive",
            discard_portfolio_draft: "destructive",
            restore_portfolio_publication: "destructive",
            publish_portfolio_changes: "destructive",
            list_portfolio_media: "read",
            add_portfolio_media: "write",
            delete_portfolio_media: "destructive",
            update_portfolio_settings: "write",
            publish_portfolio: "destructive",
            unpublish_portfolio: "destructive",
            update_portfolio_slug: "destructive",
            list_portfolio_items: "read",
            create_portfolio_item: "write",
            update_portfolio_item: "write",
            archive_portfolio_item: "destructive",
            restore_portfolio_item: "write",
            delete_portfolio_item: "destructive",
        })
        expect(OPEX_NO_PANEL_GROUPS.has("portfolio")).toBe(true)
        expect(OPEX_NO_PANEL_GROUPS.has("portfolio-items")).toBe(true)
    })
})
