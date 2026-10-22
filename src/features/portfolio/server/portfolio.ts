import { randomBytes } from "node:crypto"
import type { ClientSession, Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { withBasePath } from "@/lib/base-path"
import { appOrigin } from "@/features/auth/server/origin"
import { parseInput } from "@/features/access/server/commands"
import type { AccessContext } from "@/features/access/server/context"
import { DEFAULT_BUSINESS_THEME } from "@/features/businesses/constants"
import { auditBusiness, canBusiness } from "@/features/businesses/server/access"
import { businessLogoPath } from "@/features/businesses/server/businesses"
import { readBusiness, userNames, writeItem, type BusinessDoc } from "@/features/businesses/server/items"
import { businessModels, type BusinessPortfolioRecord, type StoredPortfolioBlock } from "@/features/businesses/server/models"
import { ownerAccountEmail } from "@/features/orders/server/orders"
import { blockSummary, mediaIdsOf, portfolioBlockSchema, pruneMediaRef, portfolioBlocksSchema, publishProblems, PORTFOLIO_PUBLICATIONS_KEEP, type PortfolioBlock } from "../blocks"
import { portfolioPagePath, PORTFOLIO_SLUG_MAX } from "../constants"
import { slugCandidates, slugProblem, SLUG_PROBLEM_MESSAGES, whatsappUrl } from "../logic"
import { portfolioDraftSaveSchema, portfolioDraftVersionSchema, portfolioPublishChangesSchema, portfolioSettingsSchema, portfolioSlugUpdateSchema, portfolioTemplateSchema, portfolioVersionSchema } from "../schemas"
import { buildTemplate, PORTFOLIO_TEMPLATE_INFO } from "../templates"
import type { PortfolioBusinessDto, PortfolioDraftSavedDto, PortfolioDto, PortfolioPublicationDto, PortfolioSlugCheckDto } from "../types"
import { loadMedia, toMediaDto } from "./media"
import { loadContentPool } from "./pool"

/**
 * Editor do portfólio (M5) — SOMENTE servidor. Leitura do dono (`portfolio.view`) ou do suporte
 * (`businesses.view_all`, somente leitura e auditado pela seção `portfolio`). Escrita só do dono
 * efetivo (`writeItem`: fence, acesso relido, negócio ativo): o rascunho dos blocos com
 * `portfolio.edit` (salvamento automático, sem auditoria por tecla); publicar alterações, publicar/
 * despublicar a página, endereço e indexação com `portfolio.publish`, auditados. Criado na primeira
 * abertura pelo dono, com o slug sugerido pelo nome (reservado mesmo despublicado; liberado ao
 * excluir o negócio).
 */

export type PortfolioDoc = BusinessPortfolioRecord & { _id: Types.ObjectId }

export const portfolioUrl = (slug: string) => `${appOrigin()}${withBasePath(portfolioPagePath(slug))}`
const conflict = () => new DomainError(409, "O portfólio foi alterado por outra ação. Recarregue e revise antes de salvar.", "VERSION_CONFLICT")
const draftConflict = () => new DomainError(409, "O rascunho foi alterado em outro lugar (outra aba ou o Agente Opex). Recarregue para continuar.", "PORTFOLIO_DRAFT_CONFLICT")
const slugTaken = () => new DomainError(409, "Este endereço já está em uso por outro portfólio. Escolha outro.", "PORTFOLIO_SLUG_TAKEN")
const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000
const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : null)

/** Blocos guardados → blocos válidos (um bloco inválido sai sem derrubar a página). */
export function readBlocks(raw: readonly unknown[] | null | undefined): PortfolioBlock[] {
    const list = raw ?? []
    const all = portfolioBlocksSchema.safeParse(list)
    if (all.success) return all.data
    return list.flatMap((block) => {
        const parsed = portfolioBlockSchema.safeParse(block)
        return parsed.success ? [parsed.data] : []
    })
}

const stored = (blocks: readonly PortfolioBlock[]) => blocks as unknown as StoredPortfolioBlock[]
const sameBlocks = (a: readonly unknown[], b: readonly unknown[]) => JSON.stringify(a) === JSON.stringify(b)

export async function findPortfolio(businessId: string, session: ClientSession | null = null): Promise<PortfolioDoc | null> {
    return businessModels().portfolios.findOne({ businessId }).session(session).lean<PortfolioDoc>()
}

/** Cria o portfólio (despublicado, sem blocos) com o primeiro slug livre sugerido pelo nome. Só o dono, negócio ativo. */
export async function ensurePortfolio(access: AccessContext, businessId: string): Promise<PortfolioDoc> {
    const existing = await findPortfolio(businessId)
    if (existing) return existing
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await writeItem(
                access,
                businessId,
                "portfolio",
                async ({ current, session, business, ownerId }) => {
                    const { portfolios } = businessModels()
                    const found = await portfolios.findOne({ businessId }).session(session).lean<PortfolioDoc>()
                    if (found) return { result: found }
                    const candidates = slugCandidates(business.name, business.number)
                    const taken = new Set((await portfolios.find({ slug: { $in: candidates } }).select({ slug: 1 }).session(session).lean()).map((doc) => doc.slug))
                    const slug = candidates.find((candidate) => !taken.has(candidate)) ?? `${candidates[0]!.slice(0, PORTFOLIO_SLUG_MAX - 9).replace(/-+$/g, "")}-${randomBytes(4).toString("hex")}`
                    const [created] = await portfolios.create([{ businessId, ownerId, slug, published: false, publishedAt: null, indexable: false, started: false, createdBy: current.userId, updatedBy: current.userId }], { session })
                    await auditBusiness(current, "business.portfolio.create", businessId, null, { slug, published: false }, session)
                    return { result: created!.toObject() as PortfolioDoc }
                },
                ["portfolio.view"],
            )
        } catch (error) {
            if (isDuplicateKey(error) && attempt < 3) {
                const raced = await findPortfolio(businessId)
                if (raced) return raced
                continue
            }
            throw error
        }
    }
}

/** Cabeçalho e contato fixos (Ficha do negócio). Sem e-mail comercial, o da conta (P51). */
export async function portfolioBusiness(business: BusinessDoc, logoUrl: string | null): Promise<{ business: PortfolioBusinessDto; contactEmailIsAccount: boolean }> {
    const accountEmail = business.contactEmail ? null : await ownerAccountEmail(business.ownerId)
    return {
        business: {
            name: business.name,
            description: business.description ?? null,
            segment: business.segment ?? null,
            logoUrl,
            links: business.links ?? [],
            contactEmail: business.contactEmail ?? accountEmail,
            contactPhone: business.contactPhone ?? null,
            whatsappUrl: whatsappUrl(business.contactPhone),
            theme: { primaryColor: business.theme?.primaryColor ?? DEFAULT_BUSINESS_THEME.primaryColor, mode: business.theme?.mode === "light" ? "light" : "dark" },
        },
        contactEmailIsAccount: !business.contactEmail,
    }
}

export const logoVersion = (key: string) => encodeURIComponent(key.split("/").slice(-2).join("-"))

/** Editor do portfólio: configuração, rascunho, publicado, conteúdo disponível e mídia. */
export async function getPortfolio(access: AccessContext, businessId: string): Promise<PortfolioDto> {
    const { business, editable, own } = await readBusiness(access, businessId, "portfolio")
    const doc = (await findPortfolio(businessId)) ?? (own && business.status === "active" ? await ensurePortfolio(access, businessId) : null)
    const [{ pool, unavailable }, media, header] = await Promise.all([
        loadContentPool(businessId, business.ownerId),
        loadMedia(businessId),
        portfolioBusiness(business, business.logo ? `${businessLogoPath(businessId)}?v=${logoVersion(business.logo.key)}` : null),
    ])
    const draft = readBlocks(doc?.draft?.blocks)
    const live = readBlocks(doc?.live?.blocks)
    const slug = doc?.slug || null
    return {
        businessId,
        slug,
        url: slug ? portfolioUrl(slug) : null,
        published: doc?.published ?? false,
        publishedAt: iso(doc?.publishedAt),
        indexable: doc?.indexable ?? false,
        version: doc?.version ?? 0,
        draft: { blocks: draft, version: doc?.draft?.version ?? 0, updatedAt: iso(doc?.draft?.updatedAt) },
        live: { blocks: live, number: doc?.live?.number ?? 0, publishedAt: iso(doc?.live?.publishedAt) },
        hasChanges: !sameBlocks(draft, live),
        needsTemplate: Boolean(doc) && !doc?.started && !draft.length && !(doc?.live?.number ?? 0),
        problems: publishProblems(draft),
        pool,
        unavailable,
        media: media.map((file) => toMediaDto(businessId, file)),
        business: header.business,
        contactEmailIsAccount: header.contactEmailIsAccount,
        businessStatus: business.status,
        editable,
        canPublish: own && business.status === "active" && canBusiness(access, "portfolio.publish"),
    }
}

/** Documento do portfólio dentro da transação (404 se não existir). */
async function loadForWrite(businessId: string, session: ClientSession): Promise<PortfolioDoc> {
    const doc = await findPortfolio(businessId, session)
    if (!doc) throw new DomainError(404, "Portfólio não encontrado", "PORTFOLIO_NOT_FOUND")
    return doc
}

/** As imagens dos blocos precisam estar na mídia do negócio. */
async function assertMedia(businessId: string, blocks: readonly PortfolioBlock[], session: ClientSession): Promise<void> {
    const ids = mediaIdsOf(blocks)
    if (!ids.length) return
    const library = new Set((await loadMedia(businessId, session)).map((doc) => doc._id.toString()))
    if (ids.some((id) => !library.has(id))) throw new DomainError(400, "Imagem não encontrada na mídia do portfólio: envie-a de novo.", "PORTFOLIO_MEDIA_NOT_FOUND")
}

/** Troca os blocos do rascunho (versão conferida). */
async function writeDraft(doc: PortfolioDoc, blocks: readonly PortfolioBlock[], draftVersion: number, actorId: string, session: ClientSession, extra: Record<string, unknown> = {}): Promise<{ version: number; updatedAt: Date }> {
    const updatedAt = new Date()
    const updated = await businessModels().portfolios.updateOne(
        { _id: doc._id, "draft.version": draftVersion },
        { $set: { "draft.blocks": stored(blocks), "draft.updatedAt": updatedAt, "draft.updatedBy": actorId, started: true, updatedBy: actorId, ...extra }, $inc: { "draft.version": 1 } },
        { session },
    )
    if (!updated.modifiedCount) throw draftConflict()
    return { version: draftVersion + 1, updatedAt }
}

/** Salvamento automático do rascunho (o editor envia a página inteira). */
export async function savePortfolioDraft(access: AccessContext, businessId: string, raw: unknown): Promise<PortfolioDraftSavedDto> {
    const { blocks, draftVersion } = parseInput(portfolioDraftSaveSchema, raw)
    await ensurePortfolio(access, businessId)
    return writeItem(access, businessId, "portfolio", async ({ current, session }) => {
        const doc = await loadForWrite(businessId, session)
        if ((doc.draft?.version ?? 0) !== draftVersion) throw draftConflict()
        await assertMedia(businessId, blocks, session)
        const saved = await writeDraft(doc, blocks, draftVersion, current.userId, session)
        return { result: { draftVersion: saved.version, updatedAt: saved.updatedAt.toISOString(), hasChanges: !sameBlocks(blocks, readBlocks(doc.live?.blocks)), problems: publishProblems(blocks) } }
    })
}

/** "Publicar alterações": o rascunho vira a página publicada (e entra no histórico). `publishPage` também liga a página. */
export async function publishPortfolioChanges(access: AccessContext, businessId: string, raw: unknown): Promise<PortfolioDto> {
    const { draftVersion, version, publishPage } = parseInput(portfolioPublishChangesSchema, raw)
    await ensurePortfolio(access, businessId)
    await writeItem(
        access,
        businessId,
        "portfolio",
        async ({ current, session, ownerId }) => {
            const doc = await loadForWrite(businessId, session)
            if ((doc.draft?.version ?? 0) !== draftVersion) throw draftConflict()
            if ((doc.version ?? 0) !== version) throw conflict()
            const blocks = readBlocks(doc.draft?.blocks)
            const problems = publishProblems(blocks)
            if (problems.length) throw new DomainError(400, `Corrija ${problems.length} problema(s) antes de publicar: ${problems[0]!.message}.`, "PORTFOLIO_DRAFT_INVALID", { problems })
            await assertMedia(businessId, blocks, session)
            const models = businessModels()
            const number = (doc.live?.number ?? 0) + 1
            const now = new Date()
            await models.portfolios.updateOne(
                { _id: doc._id },
                {
                    $set: { live: { blocks: stored(blocks), number, publishedAt: now, publishedBy: current.userId }, started: true, updatedBy: current.userId, ...(publishPage && !doc.published ? { published: true, publishedAt: now } : {}) },
                    $inc: { version: 1 },
                },
                { session },
            )
            await models.portfolioPublications.create([{ businessId, ownerId, number, blocks: stored(blocks), publishedAt: now, publishedBy: current.userId }], { session })
            const keep = await models.portfolioPublications.find({ businessId }).sort({ number: -1 }).skip(PORTFOLIO_PUBLICATIONS_KEEP - 1).limit(1).session(session).lean()
            if (keep[0]) await models.portfolioPublications.deleteMany({ businessId, number: { $lt: keep[0].number } }, { session })
            const previous = readBlocks(doc.live?.blocks)
            await auditBusiness(
                current,
                "business.portfolio.publish_changes",
                businessId,
                { number: doc.live?.number ?? 0, blocks: previous.map(blockSummary), published: doc.published },
                { number, blocks: blocks.map(blockSummary), published: publishPage || doc.published },
                session,
            )
            if (publishPage && !doc.published) await auditBusiness(current, "business.portfolio.publish", businessId, { published: false, slug: doc.slug }, { published: true, slug: doc.slug }, session)
            return { result: undefined }
        },
        ["portfolio.publish"],
    )
    return getPortfolio(access, businessId)
}

/** Descarta o rascunho: volta para a página publicada. */
export async function discardPortfolioDraft(access: AccessContext, businessId: string, raw: unknown): Promise<PortfolioDto> {
    const { draftVersion } = parseInput(portfolioDraftVersionSchema, raw)
    await ensurePortfolio(access, businessId)
    await writeItem(access, businessId, "portfolio", async ({ current, session }) => {
        const doc = await loadForWrite(businessId, session)
        if ((doc.draft?.version ?? 0) !== draftVersion) throw draftConflict()
        const live = readBlocks(doc.live?.blocks)
        const draft = readBlocks(doc.draft?.blocks)
        if (sameBlocks(live, draft)) return { result: undefined }
        await writeDraft(doc, live, draftVersion, current.userId, session)
        await auditBusiness(current, "business.portfolio.discard_draft", businessId, { blocks: draft.map(blockSummary) }, { blocks: live.map(blockSummary) }, session)
        return { result: undefined }
    })
    return getPortfolio(access, businessId)
}

/** Aplica um modelo pronto ao rascunho (substitui os blocos). */
export async function applyPortfolioTemplate(access: AccessContext, businessId: string, raw: unknown): Promise<PortfolioDto> {
    const { template, draftVersion } = parseInput(portfolioTemplateSchema, raw)
    await ensurePortfolio(access, businessId)
    await writeItem(access, businessId, "portfolio", async ({ current, session, business }) => {
        const doc = await loadForWrite(businessId, session)
        if ((doc.draft?.version ?? 0) !== draftVersion) throw draftConflict()
        const { pool } = await loadContentPool(businessId, business.ownerId, session)
        const blocks = buildTemplate(template, {
            description: business.description ?? null,
            counts: { services: pool.services.length, successes: pool.successes.length, documents: pool.documents.length, items: pool.items.length },
            firstSuccessId: pool.successes[0]?.id ?? null,
            hasPhone: Boolean(whatsappUrl(business.contactPhone)),
        })
        const before = readBlocks(doc.draft?.blocks)
        await writeDraft(doc, blocks, draftVersion, current.userId, session)
        await auditBusiness(current, "business.portfolio.template", businessId, { blocks: before.map(blockSummary) }, { template: PORTFOLIO_TEMPLATE_INFO[template].label, blocks: blocks.map(blockSummary) }, session)
        return { result: undefined }
    })
    return getPortfolio(access, businessId)
}

/** Últimas publicações (mais recentes primeiro). */
export async function listPortfolioPublications(access: AccessContext, businessId: string): Promise<PortfolioPublicationDto[]> {
    await readBusiness(access, businessId, "portfolio.history")
    const [docs, portfolio] = await Promise.all([businessModels().portfolioPublications.find({ businessId }).sort({ number: -1 }).limit(PORTFOLIO_PUBLICATIONS_KEEP).lean(), findPortfolio(businessId)])
    const names = await userNames(docs.map((doc) => doc.publishedBy))
    return docs.map((doc) => ({ number: doc.number, publishedAt: new Date(doc.publishedAt).toISOString(), publishedBy: doc.publishedBy, publishedByName: names.get(doc.publishedBy) ?? null, blocks: readBlocks(doc.blocks).length, current: doc.number === (portfolio?.live?.number ?? 0) }))
}

/** Restaura uma publicação antiga como rascunho (a página publicada só muda ao publicar). */
export async function restorePortfolioPublication(access: AccessContext, businessId: string, number: number, raw: unknown): Promise<PortfolioDto> {
    const { draftVersion } = parseInput(portfolioDraftVersionSchema, raw)
    if (!Number.isInteger(number) || number < 1) throw new DomainError(404, "Publicação não encontrada", "PORTFOLIO_PUBLICATION_NOT_FOUND")
    await ensurePortfolio(access, businessId)
    await writeItem(access, businessId, "portfolio", async ({ current, session }) => {
        const models = businessModels()
        const doc = await loadForWrite(businessId, session)
        if ((doc.draft?.version ?? 0) !== draftVersion) throw draftConflict()
        const publication = await models.portfolioPublications.findOne({ businessId, number }).session(session).lean()
        if (!publication) throw new DomainError(404, "Publicação não encontrada", "PORTFOLIO_PUBLICATION_NOT_FOUND")
        // Imagens que saíram da mídia ficam como espaço vazio.
        const library = new Set((await loadMedia(businessId, session)).map((file) => file._id.toString()))
        let blocks = readBlocks(publication.blocks)
        for (const id of mediaIdsOf(blocks)) if (!library.has(id)) blocks = pruneMediaRef(blocks, id)
        const before = readBlocks(doc.draft?.blocks)
        await writeDraft(doc, blocks, draftVersion, current.userId, session)
        await auditBusiness(current, "business.portfolio.restore_publication", businessId, { blocks: before.map(blockSummary) }, { number, blocks: blocks.map(blockSummary) }, session)
        return { result: undefined }
    })
    return getPortfolio(access, businessId)
}

/** Publicar (expõe a página `/p/[slug]`) ou despublicar (404 público). */
export async function setPortfolioPublished(access: AccessContext, businessId: string, published: boolean, raw: unknown): Promise<PortfolioDto> {
    const { version } = parseInput(portfolioVersionSchema, raw)
    await ensurePortfolio(access, businessId)
    await writeItem(
        access,
        businessId,
        "portfolio",
        async ({ current, session }) => {
            const doc = await loadForWrite(businessId, session)
            if ((doc.version ?? 0) !== version) throw conflict()
            if (doc.published === published) return { result: undefined }
            if (published && !(doc.live?.number ?? 0)) throw new DomainError(409, "Publique as alterações da página antes de ligá-la: ainda não há versão publicada.", "PORTFOLIO_NOTHING_PUBLISHED")
            await businessModels().portfolios.updateOne({ _id: doc._id }, { $set: { published, ...(published ? { publishedAt: new Date() } : {}), updatedBy: current.userId }, $inc: { version: 1 } }, { session })
            await auditBusiness(current, published ? "business.portfolio.publish" : "business.portfolio.unpublish", businessId, { published: doc.published, slug: doc.slug }, { published, slug: doc.slug }, session)
            return { result: undefined }
        },
        ["portfolio.publish"],
    )
    return getPortfolio(access, businessId)
}

/** Indexação pelos buscadores. */
export async function updatePortfolioSettings(access: AccessContext, businessId: string, raw: unknown): Promise<PortfolioDto> {
    const { indexable, version } = parseInput(portfolioSettingsSchema, raw)
    await ensurePortfolio(access, businessId)
    await writeItem(
        access,
        businessId,
        "portfolio",
        async ({ current, session }) => {
            const doc = await loadForWrite(businessId, session)
            if ((doc.version ?? 0) !== version) throw conflict()
            if (doc.indexable === indexable) return { result: undefined }
            await businessModels().portfolios.updateOne({ _id: doc._id }, { $set: { indexable, updatedBy: current.userId }, $inc: { version: 1 } }, { session })
            await auditBusiness(current, "business.portfolio.update", businessId, { indexable: doc.indexable }, { indexable }, session)
            return { result: undefined }
        },
        ["portfolio.publish"],
    )
    return getPortfolio(access, businessId)
}

/** Troca o endereço: o antigo deixa de funcionar na hora (sem redirecionamento). */
export async function updatePortfolioSlug(access: AccessContext, businessId: string, raw: unknown): Promise<PortfolioDto> {
    const { slug, version } = parseInput(portfolioSlugUpdateSchema, raw)
    await ensurePortfolio(access, businessId)
    try {
        await writeItem(
            access,
            businessId,
            "portfolio",
            async ({ current, session }) => {
                const doc = await loadForWrite(businessId, session)
                if ((doc.version ?? 0) !== version) throw conflict()
                if (doc.slug === slug) return { result: undefined }
                const { portfolios } = businessModels()
                if (await portfolios.exists({ slug, businessId: { $ne: businessId } }).session(session)) throw slugTaken()
                await portfolios.updateOne({ _id: doc._id }, { $set: { slug, updatedBy: current.userId }, $inc: { version: 1 } }, { session })
                await auditBusiness(current, "business.portfolio.slug", businessId, { slug: doc.slug }, { slug, published: doc.published }, session)
                return { result: undefined }
            },
            ["portfolio.publish"],
        )
    } catch (error) {
        if (isDuplicateKey(error)) throw slugTaken()
        throw error
    }
    return getPortfolio(access, businessId)
}

/** Confere um endereço antes de salvar (formato, reservado e disponibilidade). */
export async function checkPortfolioSlug(access: AccessContext, businessId: string, rawSlug: string): Promise<PortfolioSlugCheckDto> {
    await readBusiness(access, businessId, "portfolio")
    const slug = rawSlug.trim().toLowerCase()
    const problem = slugProblem(slug)
    if (problem) return { slug, valid: false, available: false, message: SLUG_PROBLEM_MESSAGES[problem] }
    const taken = await businessModels().portfolios.exists({ slug, businessId: { $ne: businessId } })
    return { slug, valid: true, available: !taken, message: taken ? "Este endereço já está em uso por outro portfólio." : null }
}
