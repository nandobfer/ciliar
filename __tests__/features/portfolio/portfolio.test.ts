import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server-core"

vi.mock("@/lib/db", async (original) => ({ ...(await original<object>()), dbConnect: vi.fn(async () => undefined) }))
vi.mock("ai", () => ({ dynamicTool: (def: unknown) => def }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined), integrationChannel: (id: string) => `private-integration-${id}` }))
vi.mock("@/lib/after-response", () => ({ runAfterResponse: vi.fn() }))
vi.mock("@/lib/email/mailer", () => ({ isMockMode: vi.fn(async () => true), sendEmail: vi.fn() }))
const storage = vi.hoisted(() => ({
    copyFile: vi.fn(async () => undefined),
    deleteFile: vi.fn(async () => undefined),
    getUploadUrl: vi.fn(async (key: string) => `https://s3.local/${key}?upload`),
    headFile: vi.fn(async () => ({ contentLength: 2048, contentType: "application/pdf", lastModified: new Date() })),
    getFileUrl: vi.fn(async (key: string, options: { downloadName?: string; contentType?: string; expiresIn?: number } = {}) => `https://s3.local/${key}?${options.downloadName ? "download" : "view"}&expires=${options.expiresIn}`),
}))
vi.mock("@/lib/storage/s3", async (original) => ({ ...(await original<object>()), ...storage }))
const chat = vi.hoisted(() => ({ loadSessionFile: vi.fn() }))
vi.mock("@/features/opex-agent/server/files", async (original) => ({ ...(await original<object>()), loadSessionFile: chat.loadSessionFile }))

import { BUSINESS_FULL_PERMISSIONS } from "@/features/businesses/permissions"
import { accessModels } from "@/features/access/server/models"
import { createRole } from "@/features/access/server/commands"
import { resolveAccess } from "@/features/access/server/access"
import type { AccessContext } from "@/features/access/server/context"
import { businessModels } from "@/features/businesses/server/models"
import { archiveBusiness, deleteBusiness, restoreBusiness } from "@/features/businesses/server/businesses"
import { archiveActivity, createActivity } from "@/features/businesses/server/activities"
import { completeBusinessFile, reserveBusinessFile } from "@/features/businesses/server/files"
import { createDocument, updateDocument } from "@/features/businesses/server/documents"
import { archiveSuccess, createSuccess, deleteSuccess, restoreSuccess } from "@/features/businesses/server/successes"
import { purgeArchivedItems } from "@/features/businesses/server/items"
import { platformModels } from "@/features/platform/server/models"
import { orderModels } from "@/features/orders/server/models"
import { createClient } from "@/features/orders/server/clients"
import { applyPortfolioTemplate, checkPortfolioSlug, discardPortfolioDraft, getPortfolio, listPortfolioPublications, publishPortfolioChanges, restorePortfolioPublication, savePortfolioDraft, setPortfolioPublished, updatePortfolioSettings, updatePortfolioSlug } from "@/features/portfolio/server/portfolio"
import { archivePortfolioItem, createPortfolioItem, deletePortfolioItem, listPortfolioItems, portfolioTagSuggestions, updatePortfolioItem } from "@/features/portfolio/server/items"
import { addPortfolioMedia, deletePortfolioMedia, listPortfolioMedia } from "@/features/portfolio/server/media"
import { getPortfolioPreview, getPublicPortfolio } from "@/features/portfolio/server/public"
import { newBlock, type PortfolioBlock } from "@/features/portfolio/blocks"
import { convertPortfolioBlocks } from "@/lib/db/migrations/convert-portfolio-blocks"
import { findOpexTool } from "@/features/opex-agent/server/tools/registry"
import { scopeOfAccess } from "@/features/opex-agent/server/scope"

/** Portfólio (M5) contra os serviços reais (MongoMemoryReplSet efêmero; nunca o banco real). */

let replica: MongoMemoryReplSet
let admin: AccessContext
let ana: AccessContext
let bia: AccessContext
let businessId: string
let providerRoleId: string
const access = accessModels()
const businesses = businessModels()
const platform = platformModels()
const orders = orderModels()
const all = () => [...Object.values(access), ...Object.values(businesses), ...Object.values(platform), ...Object.values(orders)]
const DAY = 24 * 60 * 60 * 1000

async function uploaded(owner: AccessContext, id: string, purpose: "document" | "success" | "portfolio" | "media", name: string, mediaType: string) {
    const reservation = await reserveBusinessFile(owner, id, { purpose, name, size: 2048, mediaType })
    await completeBusinessFile(owner, id, reservation.id)
    return reservation.id
}
const viewAsUser = (userId: string) => Buffer.from(JSON.stringify({ tipo: "usuario", userId })).toString("base64url")

beforeAll(async () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "portfolio-tests-only-key"
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.18" }, replSet: { count: 1 }, instanceOpts: [{ ip: "127.0.0.1" }] })
    await mongoose.connect(replica.getUri("ciliar_portfolio_test"))
    await Promise.all(all().map((model) => model.init()))
}, 120_000)
beforeEach(async () => {
    vi.clearAllMocks()
    await Promise.all(all().map((model) => model.deleteMany({})))
    const role = await access.roles.create({ slug: "admin", nome: "Administrador", permissoes: ["*"], ativo: true })
    const actor = await access.users.create({ name: "Admin", email: "admin@example.test", active: true, roles: [role.id] })
    admin = await resolveAccess(actor.id as string)
    const provider = await createRole(admin, { nome: "Prestador", descricao: "", cor: "azul", ativo: true, permissoes: [...BUSINESS_FULL_PERMISSIONS], limiteNegocios: null })
    providerRoleId = provider.id
    ana = await resolveAccess((await access.users.create({ name: "Ana", email: "ana@example.test", active: true, roles: [provider.id] })).id as string)
    bia = await resolveAccess((await access.users.create({ name: "Bia", email: "bia@example.test", active: true, roles: [provider.id] })).id as string)
    businessId = (await businesses.businesses.create({ ownerId: ana.userId, number: 1, name: "Studio Ágil", segment: "Design", description: "Marcas e sites", contactPhone: "(11) 99999-0000", createdBy: ana.userId, updatedBy: ana.userId }))._id.toString()
})
afterAll(async () => {
    await mongoose.disconnect()
    await replica?.stop()
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY
})

/** Conteúdo completo: atividade, sucesso com cliente e anexos (imagem + PDF), documento marcado e outro não. */
async function content() {
    const activity = await createActivity(ana, businessId, { name: "Identidade visual", description: "Logo e manual", hourlyRateCents: 25000 })
    const clientId = (await createClient(ana, { name: "Padaria Sol", email: "sol@example.test" })).id
    const image = await uploaded(ana, businessId, "success", "antes-depois.png", "image/png")
    const pdf = await uploaded(ana, businessId, "success", "relatorio.pdf", "application/pdf")
    const success = await createSuccess(ana, businessId, { title: "Nova marca", result: "+30% de vendas", date: "2026-05-02", clientId, attachmentIds: [image, pdf] })
    const document = await createDocument(ana, businessId, { name: "Apresentação", portfolio: true, fileId: await uploaded(ana, businessId, "document", "apresentacao.pdf", "application/pdf") })
    const privateDoc = await createDocument(ana, businessId, { name: "Contrato", portfolio: false, fileId: await uploaded(ana, businessId, "document", "contrato.pdf", "application/pdf") })
    return { activity, success, document, privateDoc, clientId }
}

const draftOf = async (who: AccessContext = ana) => (await getPortfolio(who, businessId)).draft
async function saveBlocks(blocks: PortfolioBlock[], who: AccessContext = ana) {
    const draft = await draftOf(who)
    return savePortfolioDraft(who, businessId, { blocks, draftVersion: draft.version })
}
async function publish(publishPage = true, who: AccessContext = ana) {
    const portfolio = await getPortfolio(who, businessId)
    return publishPortfolioChanges(who, businessId, { draftVersion: portfolio.draft.version, version: portfolio.version, publishPage })
}
async function mediaOf(name = "capa.png") {
    const id = await uploaded(ana, businessId, "media", name, "image/png")
    await addPortfolioMedia(ana, businessId, { fileIds: [id] })
    return id
}

describe("editor: rascunho e publicação", () => {
    it("o dono abre e cria com o slug sugerido (único) e pede o modelo; suporte só lê; outro usuário não vê", async () => {
        const portfolio = await getPortfolio(ana, businessId)
        expect(portfolio).toMatchObject({ slug: "studio-agil", url: "http://localhost:3101/p/studio-agil", published: false, indexable: false, editable: true, canPublish: true, needsTemplate: true, draft: { blocks: [], version: 0 }, live: { number: 0 } })
        expect(portfolio.business).toMatchObject({ name: "Studio Ágil", contactEmail: "ana@example.test", whatsappUrl: "https://wa.me/5511999990000" })
        const other = (await businesses.businesses.create({ ownerId: bia.userId, number: 1, name: "Studio Agil", createdBy: bia.userId, updatedBy: bia.userId }))._id.toString()
        expect((await getPortfolio(bia, other)).slug).toBe("studio-agil-2")
        expect(await getPortfolio(admin, businessId)).toMatchObject({ editable: false, canPublish: false })
        await expect(getPortfolio(bia, businessId)).rejects.toMatchObject({ code: "BUSINESS_NOT_FOUND" })
        await expect(savePortfolioDraft(admin, businessId, { blocks: [], draftVersion: 0 })).rejects.toMatchObject({ code: "BUSINESS_NOT_FOUND" })
        // Ligar a página sem nenhuma versão publicada é recusado.
        await expect(setPortfolioPublished(ana, businessId, true, { version: portfolio.version })).rejects.toMatchObject({ code: "PORTFOLIO_NOTHING_PUBLISHED" })
    })

    it("salva o rascunho, bloqueia publicar com problemas e publica a lista explícita (conteúdo ao vivo, cliente confidencial)", async () => {
        const { activity, success, document } = await content()
        const media = await mediaOf()
        const image = newBlock("image", { mediaId: media, alt: "" })
        let saved = await saveBlocks([
            newBlock("heading", { text: "Trabalhos" }),
            newBlock("section", { source: "successes", mode: "picked", picks: [{ id: success.id, showClient: false }] }),
            newBlock("section", { source: "documents", mode: "all" }),
            newBlock("featured", { source: "services", refId: activity.id }),
            image,
            newBlock("button", { action: "whatsapp", label: "Fale comigo" }),
        ])
        expect(saved).toMatchObject({ draftVersion: 1, hasChanges: true, problems: [{ blockId: image.id }] })
        await expect(publish()).rejects.toMatchObject({ code: "PORTFOLIO_DRAFT_INVALID" })
        const draft = await draftOf()
        saved = await savePortfolioDraft(ana, businessId, { blocks: draft.blocks.map((block) => (block.id === image.id ? { ...block, alt: "Capa" } : block)) as PortfolioBlock[], draftVersion: draft.version })
        expect(saved.problems).toEqual([])
        let portfolio = await publish()
        expect(portfolio).toMatchObject({ published: true, hasChanges: false, live: { number: 1 } })

        const page = await getPublicPortfolio("studio-agil")
        expect(page.indexable).toBe(false)
        expect(page.blocks.map((block) => block.type)).toEqual(["heading", "section", "section", "featured", "image", "button"])
        expect(page.blocks[1]).toMatchObject({ cards: [{ title: "Nova marca", client: "Cliente confidencial", images: [{ name: "antes-depois.png", viewUrl: expect.stringContaining("?view&expires=600") }] }] })
        expect(page.blocks[2]).toMatchObject({ cards: [{ name: "Apresentação", file: { kind: "pdf", downloadUrl: expect.stringContaining("?download") } }] })
        expect(page.blocks[3]).toMatchObject({ card: { name: "Identidade visual" } })
        expect(page.blocks[4]).toMatchObject({ file: { name: "capa.png" }, alt: "Capa" })
        expect(page.blocks[5]).toMatchObject({ href: "https://wa.me/5511999990000" })
        const json = JSON.stringify(page)
        for (const secret of ["25000", "hourlyRate", "Padaria", "ownerId", "contrato.pdf", "relatorio.pdf", "sol@example.test", "picks"]) expect(json).not.toContain(secret)
        expect(document.portfolio).toBe(true)

        // Mudar o rascunho não muda a página até publicar; arquivar um conteúdo tira da página na hora.
        await saveBlocks([newBlock("heading", { text: "Só no rascunho" })])
        expect((await getPublicPortfolio("studio-agil")).blocks[0]).toMatchObject({ text: "Trabalhos" })
        expect((await getPortfolioPreview(ana, businessId)).blocks.map((block) => block.type)).toEqual(["heading"])
        await archiveSuccess(ana, businessId, success.id)
        expect((await getPublicPortfolio("studio-agil")).blocks.map((block) => block.type)).toEqual(["heading", "section", "featured", "image", "button"])
        portfolio = await getPortfolio(ana, businessId)
        expect(portfolio.hasChanges).toBe(true)
        expect(await access.audits.countDocuments({ action: "business.portfolio.publish_changes" })).toBe(1)
        expect(await access.audits.countDocuments({ action: "business.portfolio.publish" })).toBe(1)
    })

    it("versão do rascunho, mídia da biblioteca, histórico com restauração e descartar rascunho", async () => {
        const first = await saveBlocks([newBlock("heading", { text: "Versão 1" })])
        await expect(savePortfolioDraft(ana, businessId, { blocks: [], draftVersion: first.draftVersion - 1 })).rejects.toMatchObject({ code: "PORTFOLIO_DRAFT_CONFLICT" })
        await expect(saveBlocks([newBlock("image", { mediaId: "f".repeat(24), alt: "x" })])).rejects.toMatchObject({ code: "PORTFOLIO_MEDIA_NOT_FOUND" })
        await publish()
        await saveBlocks([newBlock("heading", { text: "Versão 2" })])
        await publish(false)
        const history = await listPortfolioPublications(ana, businessId)
        expect(history.map((entry) => [entry.number, entry.current])).toEqual([
            [2, true],
            [1, false],
        ])
        let portfolio = await restorePortfolioPublication(ana, businessId, 1, { draftVersion: (await draftOf()).version })
        expect(portfolio.draft.blocks[0]).toMatchObject({ text: "Versão 1" })
        expect(portfolio.hasChanges).toBe(true)
        expect((await getPublicPortfolio("studio-agil")).blocks[0]).toMatchObject({ text: "Versão 2" })
        portfolio = await discardPortfolioDraft(ana, businessId, { draftVersion: portfolio.draft.version })
        expect(portfolio).toMatchObject({ hasChanges: false, draft: { blocks: [{ text: "Versão 2" }] } })
        portfolio = await applyPortfolioTemplate(ana, businessId, { template: "minimal", draftVersion: portfolio.draft.version })
        expect(portfolio.draft.blocks.map((block) => block.type)).toEqual(["text", "button"])
        expect(await access.audits.countDocuments({ action: { $in: ["business.portfolio.restore_publication", "business.portfolio.discard_draft", "business.portfolio.template"] } })).toBe(3)
    })

    it("mídia em uso não sai; conteúdo excluído sai do rascunho e do publicado", async () => {
        const { success } = await content()
        const media = await mediaOf()
        expect((await listPortfolioMedia(ana, businessId)).map((file) => file.id)).toEqual([media])
        await saveBlocks([newBlock("gallery", { mediaIds: [media] }), newBlock("featured", { source: "successes", refId: success.id }), newBlock("section", { source: "successes", mode: "picked", picks: [{ id: success.id, showClient: true }] })])
        await publish()
        await expect(deletePortfolioMedia(ana, businessId, media)).rejects.toMatchObject({ code: "PORTFOLIO_MEDIA_IN_USE" })
        const before = (await draftOf()).version
        await archiveSuccess(ana, businessId, success.id)
        await deleteSuccess(ana, businessId, success.id)
        const stored = await businesses.portfolios.findOne({ businessId }).lean().orFail()
        expect(stored.draft.blocks.map((block) => block.type)).toEqual(["gallery", "section"])
        expect(stored.live.blocks.map((block) => block.type)).toEqual(["gallery", "section"])
        expect((stored.draft.blocks[1] as { picks: unknown[] }).picks).toEqual([])
        expect(stored.draft.version).toBe(before + 1)
        await saveBlocks([])
        await publish(false)
        await deletePortfolioMedia(ana, businessId, media)
        expect(storage.deleteFile).toHaveBeenCalledWith(`businesses/${businessId}/files/${media}/capa.png`)
        expect(await listPortfolioMedia(ana, businessId)).toEqual([])
    })

    it("sem portfolio.publish edita o rascunho mas não publica; arquivado dá 404 e volta ao restaurar; despublicar dá 404", async () => {
        const editor = await createRole(admin, { nome: "Editor", descricao: "", cor: "azul", ativo: true, permissoes: BUSINESS_FULL_PERMISSIONS.filter((key) => key !== "portfolio.publish"), limiteNegocios: null })
        await access.users.updateOne({ _id: ana.userId }, { $set: { roles: [editor.id] } })
        const limited = await resolveAccess(ana.userId)
        expect((await getPortfolio(limited, businessId)).canPublish).toBe(false)
        await saveBlocks([newBlock("heading", { text: "Oi" })], limited)
        await expect(publish(true, limited)).rejects.toBeTruthy()
        await access.users.updateOne({ _id: ana.userId }, { $set: { roles: [providerRoleId] } })
        let portfolio = await publish(true, ana)
        expect(portfolio.published).toBe(true)
        await archiveBusiness(ana, businessId)
        await expect(getPublicPortfolio("studio-agil")).rejects.toMatchObject({ status: 404 })
        await expect(saveBlocks([], ana)).rejects.toMatchObject({ code: "BUSINESS_ARCHIVED" })
        await restoreBusiness(ana, businessId)
        expect((await getPublicPortfolio("studio-agil")).blocks).toHaveLength(1)
        portfolio = await getPortfolio(ana, businessId)
        portfolio = await setPortfolioPublished(ana, businessId, false, { version: portfolio.version })
        await expect(getPublicPortfolio("studio-agil")).rejects.toMatchObject({ status: 404 })
        expect((await getPortfolioPreview(ana, businessId)).published).toBe(false)
        portfolio = await updatePortfolioSettings(ana, businessId, { indexable: true, version: portfolio.version })
        expect(portfolio.indexable).toBe(true)
        await expect(setPortfolioPublished(ana, businessId, true, { version: portfolio.version - 1 })).rejects.toMatchObject({ code: "VERSION_CONFLICT" })
    })
})

describe("endereço", () => {
    it("valida formato e reservados, recusa em uso e o antigo deixa de funcionar", async () => {
        await saveBlocks([newBlock("heading", { text: "Oi" })])
        let portfolio = await publish()
        const other = (await businesses.businesses.create({ ownerId: bia.userId, number: 1, name: "Outro", createdBy: bia.userId, updatedBy: bia.userId }))._id.toString()
        await getPortfolio(bia, other)
        expect(await checkPortfolioSlug(ana, businessId, "outro")).toMatchObject({ valid: true, available: false })
        expect(await checkPortfolioSlug(ana, businessId, "admin")).toMatchObject({ valid: false })
        expect(await checkPortfolioSlug(ana, businessId, "ana-design")).toMatchObject({ valid: true, available: true })
        await expect(updatePortfolioSlug(ana, businessId, { slug: "api", version: portfolio.version })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
        await expect(updatePortfolioSlug(ana, businessId, { slug: "outro", version: portfolio.version })).rejects.toMatchObject({ code: "PORTFOLIO_SLUG_TAKEN" })
        portfolio = await updatePortfolioSlug(ana, businessId, { slug: "ana-design", version: portfolio.version })
        expect(portfolio.url).toBe("http://localhost:3101/p/ana-design")
        await expect(getPublicPortfolio("studio-agil")).rejects.toMatchObject({ status: 404 })
        expect((await getPublicPortfolio("ana-design")).slug).toBe("ana-design")
        expect(await access.audits.findOne({ action: "business.portfolio.slug" }).lean().orFail()).toMatchObject({ before: { slug: "studio-agil" }, after: { slug: "ana-design", published: true } })
    })

    it("simulação de usuário age como o alvo e audita o ator real; excluir o negócio libera o endereço e o histórico", async () => {
        const simulated = await resolveAccess(admin.userId, viewAsUser(ana.userId))
        await saveBlocks([newBlock("heading", { text: "Oi" })], simulated)
        await publish(true, simulated)
        const audit = await access.audits.findOne({ action: "business.portfolio.publish_changes" }).lean().orFail()
        expect(audit.actorId).toBe(admin.userId)
        expect(audit.simulation).toBeTruthy()
        await archiveBusiness(ana, businessId)
        await deleteBusiness(ana, businessId)
        expect(await businesses.portfolios.countDocuments({ slug: "studio-agil" })).toBe(0)
        expect(await businesses.portfolioPublications.countDocuments({ businessId })).toBe(0)
    })
})

describe("itens avulsos", () => {
    it("cria com imagens e tags, aparece na seção, arquivar tira, purge exclui e tira dos blocos", async () => {
        const image = await uploaded(ana, businessId, "portfolio", "site.png", "image/png")
        await expect(reserveBusinessFile(ana, businessId, { purpose: "portfolio", name: "x.pdf", size: 10, mediaType: "application/pdf" })).rejects.toMatchObject({ code: "BUSINESS_FILE_TYPE" })
        const first = await createPortfolioItem(ana, businessId, { title: "Site da padaria", url: "https://padaria.example", date: "2026-04-01", tags: ["Sites", " sites ", "Branding"], imageIds: [image] })
        expect(first).toMatchObject({ tags: ["Sites", "Branding"], images: [{ name: "site.png" }] })
        await expect(createPortfolioItem(ana, businessId, { title: "Ruim", url: "javascript:alert(1)" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
        const second = await createPortfolioItem(ana, businessId, { title: "App", tags: ["Apps"] })
        expect(await portfolioTagSuggestions(ana, businessId)).toEqual(["Apps", "Branding", "Sites"])
        await saveBlocks([newBlock("section", { source: "items", mode: "picked", picks: [{ id: first.id, showClient: false }, { id: second.id, showClient: false }] })])
        await publish()
        let page = await getPublicPortfolio("studio-agil")
        expect(page.blocks[0]).toMatchObject({ cards: [{ title: "Site da padaria", url: "https://padaria.example", images: [{ kind: "image", viewUrl: expect.stringContaining("site.png?view") }] }, { title: "App" }] })
        const edited = await updatePortfolioItem(ana, businessId, first.id, { imageIds: [], version: first.version })
        expect(edited.images).toEqual([])
        await archivePortfolioItem(ana, businessId, second.id)
        page = await getPublicPortfolio("studio-agil")
        expect((page.blocks[0] as { cards: unknown[] }).cards).toHaveLength(1)
        await expect(deletePortfolioItem(ana, businessId, first.id)).rejects.toMatchObject({ code: "ITEM_NOT_ARCHIVED" })
        expect(await purgeArchivedItems(new Date(Date.now() + 400 * DAY))).toContain("itens avulsos do portfólio")
        expect((await listPortfolioItems(ana, businessId)).items.map((item) => item.id)).toEqual([first.id])
        expect(((await draftOf()).blocks[0] as { picks: { id: string }[] }).picks.map((pick) => pick.id)).toEqual([first.id])
    })
})

describe("migração do portfólio antigo", () => {
    it("seções e seleções viram blocos de seção no rascunho e no publicado, com a publicação 1", async () => {
        await businesses.portfolios.collection.insertOne({
            businessId,
            ownerId: ana.userId,
            slug: "legado",
            published: true,
            publishedAt: new Date("2026-10-01T00:00:00Z"),
            indexable: false,
            sections: [{ key: "documents", visible: false }, { key: "successes", visible: true }],
            successes: [{ id: "1".repeat(24), showClient: true }],
            documents: ["2".repeat(24)],
            services: [],
            itemOrder: [],
            version: 3,
            createdBy: ana.userId,
            updatedBy: ana.userId,
        })
        expect(await convertPortfolioBlocks()).toBe(1)
        expect(await convertPortfolioBlocks()).toBe(0)
        const doc = await businesses.portfolios.findOne({ businessId }).lean().orFail()
        expect(doc.draft.blocks).toEqual([expect.objectContaining({ type: "section", source: "successes", mode: "picked", picks: [{ id: "1".repeat(24), showClient: true }] })])
        expect(doc.live).toMatchObject({ number: 1, publishedBy: "system" })
        expect(doc).not.toHaveProperty("sections")
        expect(await businesses.portfolioPublications.countDocuments({ businessId, number: 1 })).toBe(1)
        expect((await getPublicPortfolio("legado")).blocks).toEqual([])
    })
})

describe("ferramentas do Agente Opex", () => {
    const context = (who: AccessContext) => ({ sessionId: "s", actorId: who.userId, scope: scopeOfAccess(who), access: who })
    const run = (name: string, input: unknown, who: AccessContext = ana) => {
        const tool = findOpexTool(name)!
        return tool.execute(tool.input.parse(input), context(who))
    }

    it("lê a página, adiciona/edita/move/remove blocos, usa mídia do chat, publica e restaura pelos serviços reais", async () => {
        const { success } = await content()
        expect(await run("get_portfolio_page", { businessId })).toMatchObject({ slug: "studio-agil", pagePublished: false, blocks: [], available: { successes: [{ id: success.id, clientName: "Padaria Sol" }] } })
        const section = (await run("add_portfolio_block", { businessId, type: "section", props: { source: "successes", mode: "picked", picks: [{ id: success.id, showClient: true }] } })) as { added: { id: string } }
        const columns = (await run("add_portfolio_block", { businessId, type: "columns", props: { ratio: "33-33-33" } })) as { added: { id: string; columns: unknown[] } }
        expect(columns.added.columns).toHaveLength(3)
        await expect(run("add_portfolio_block", { businessId, type: "section", parentId: columns.added.id, column: 0 })).rejects.toThrow(/coluna/)
        await run("add_portfolio_block", { businessId, type: "heading", props: { text: "Dentro" }, parentId: columns.added.id, column: 2 })
        await expect(run("update_portfolio_block", { businessId, blockId: section.added.id, props: { layout: "mosaico" } })).rejects.toThrow(/Bloco inválido/)
        expect(await run("update_portfolio_block", { businessId, blockId: columns.added.id, props: { ratio: "50-50" } })).toMatchObject({ blocks: [{}, { ratio: "50-50", columns: [[], [{ text: "Dentro" }]] }] })
        await run("move_portfolio_block", { businessId, blockId: columns.added.id, delta: -1 })
        chat.loadSessionFile.mockResolvedValue({ key: "opex/s/foto.png", name: "foto.png", mediaType: "image/png", size: 1024 })
        const media = (await run("add_portfolio_media", { businessId, fileIds: ["f1"] })) as { items: { id: string }[] }
        await run("add_portfolio_block", { businessId, type: "image", props: { mediaId: media.items[0]!.id, alt: "Foto" } })
        const published = (await run("publish_portfolio_changes", { businessId, publishPage: true })) as { pagePublished: boolean; url: string }
        expect(published).toMatchObject({ pagePublished: true, url: "http://localhost:3101/p/studio-agil" })
        expect((await getPublicPortfolio("studio-agil")).blocks.map((block) => block.type)).toEqual(["columns", "section", "image"])
        await run("remove_portfolio_block", { businessId, blockId: section.added.id })
        await run("apply_portfolio_template", { businessId, template: "blank" })
        expect((await draftOf()).blocks).toEqual([])
        await run("restore_portfolio_publication", { businessId, number: 1 })
        expect((await draftOf()).blocks).toHaveLength(3)
        await run("discard_portfolio_draft", { businessId })
        expect(await run("update_portfolio_settings", { businessId, indexable: true })).toMatchObject({ indexable: true })
        expect(await run("unpublish_portfolio", { businessId })).toMatchObject({ pagePublished: false })
        await expect(run("publish_portfolio_changes", { businessId }, bia)).rejects.toMatchObject({ code: "BUSINESS_NOT_FOUND" })
        const item = (await run("create_portfolio_item", { businessId, title: "Campanha", tags: ["Ads"], fileIds: ["f1"] })) as { id: string; images: { id: string }[] }
        expect(await run("update_portfolio_item", { businessId, itemId: item.id, removeImageIds: [item.images[0]!.id] })).toMatchObject({ images: [] })
    })
})
