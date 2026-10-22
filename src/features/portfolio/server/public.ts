import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import { getFileObject, getFileUrl, storageErrorInfo } from "@/lib/storage/s3"
import type { AccessContext } from "@/features/access/server/context"
import { readBusiness, type BusinessDoc } from "@/features/businesses/server/items"
import { businessModels } from "@/features/businesses/server/models"
import { businessLogoPath } from "@/features/businesses/server/businesses"
import type { PortfolioBlock } from "../blocks"
import { PORTFOLIO_FILE_URL_TTL_SECONDS, portfolioPublicApiPath } from "../constants"
import { slugProblem } from "../logic"
import { publicBlocks, publicFileKind, referencedFiles, resolveBlocks, type PoolFile, type ResolvedFile } from "../resolve"
import type { PublicPortfolioDto } from "../types"
import { loadMedia } from "./media"
import { loadContentPool } from "./pool"
import { findPortfolio, logoVersion, portfolioBusiness, readBlocks, type PortfolioDoc } from "./portfolio"

/**
 * Página pública do portfólio (M5, SEM login) — SOMENTE servidor. Resolve os blocos PUBLICADOS com
 * o conteúdo elegível lido ao vivo e devolve só os campos da lista explícita (`resolve.ts`):
 * valores, disponibilidade, clientes (fora o nome autorizado), pedidos e trabalhos nunca entram.
 * Arquivos só por URL assinada do storage, de curta duração, e apenas os que a página mostra.
 */

const log = loggerFor({ module: "portfolio" })
const notFound = () => new DomainError(404, "Portfólio não encontrado", "PORTFOLIO_NOT_FOUND")

/** Portfólio publicado de um negócio ativo; qualquer outro caso é 404 (desligado, arquivado, inexistente). */
async function loadPublished(slug: string): Promise<{ portfolio: PortfolioDoc; business: BusinessDoc }> {
    if (slugProblem(slug) === "format") throw notFound()
    await dbConnect()
    const models = businessModels()
    const portfolio = await models.portfolios.findOne({ slug, published: true }).lean<PortfolioDoc>()
    if (!portfolio) throw notFound()
    const business = await models.businesses.findById(portfolio.businessId).lean<BusinessDoc>()
    if (!business || business.status !== "active") throw notFound()
    return { portfolio, business }
}

/** URLs assinadas (exibição e download); falha do storage tira só aquele arquivo. */
async function signFiles(businessId: string, files: readonly PoolFile[]): Promise<Map<string, ResolvedFile>> {
    const ids = [...new Set(files.map((file) => file.id))]
    if (!ids.length) return new Map()
    const docs = await businessModels().files.find({ _id: { $in: ids }, businessId, ready: true, pending: false }).lean()
    const out = new Map<string, ResolvedFile>()
    await Promise.all(
        docs.map(async (doc) => {
            const id = doc._id.toString()
            const kind = publicFileKind(doc.mediaType)
            try {
                const [viewUrl, downloadUrl] = await Promise.all([
                    kind === "file" ? null : getFileUrl(doc.key, { contentType: doc.mediaType, expiresIn: PORTFOLIO_FILE_URL_TTL_SECONDS }),
                    getFileUrl(doc.key, { downloadName: doc.name, expiresIn: PORTFOLIO_FILE_URL_TTL_SECONDS }),
                ])
                out.set(id, { id, name: doc.name, mediaType: doc.mediaType, size: doc.size, kind, viewUrl, downloadUrl })
            } catch (error) {
                log.warn({ err: error, fileId: id }, "Falha ao assinar arquivo do portfólio")
            }
        }),
    )
    return out
}

/** Monta a página com os blocos informados (publicados na página pública; o rascunho na pré-visualização). */
export async function buildPublicPortfolio(business: BusinessDoc, portfolio: Pick<PortfolioDoc, "slug" | "indexable">, blocks: readonly PortfolioBlock[], options: { logoUrl: string | null; now?: Date }): Promise<PublicPortfolioDto> {
    const now = options.now ?? new Date()
    const businessId = business._id.toString()
    const [{ pool }, mediaDocs, header] = await Promise.all([loadContentPool(businessId, business.ownerId), loadMedia(businessId), portfolioBusiness(business, options.logoUrl)])
    const media = new Map(mediaDocs.map((doc) => [doc._id.toString(), { id: doc._id.toString(), name: doc.name, mediaType: doc.mediaType, size: doc.size }]))
    const contact = { email: header.business.contactEmail, phone: header.business.contactPhone, whatsappUrl: header.business.whatsappUrl }
    // 1ª passada: quais arquivos a página mostra; 2ª: com as URLs assinadas só desses.
    const placeholder = (file: PoolFile): ResolvedFile => ({ ...file, kind: publicFileKind(file.mediaType), viewUrl: null, downloadUrl: "" })
    const needed = referencedFiles(publicBlocks(resolveBlocks(blocks, pool, media, placeholder, contact)))
    const signed = await signFiles(businessId, needed)
    const resolved = publicBlocks(resolveBlocks(blocks, pool, media, (file) => signed.get(file.id) ?? null, contact))
    return {
        slug: portfolio.slug,
        indexable: portfolio.indexable === true,
        business: header.business,
        blocks: resolved,
        // Margem de 30 s para a página reler antes de a assinatura vencer.
        urlsExpireAt: new Date(now.getTime() + (PORTFOLIO_FILE_URL_TTL_SECONDS - 30) * 1000).toISOString(),
    }
}

/** Página pública `/p/[slug]` (blocos publicados). */
export async function getPublicPortfolio(slug: string, now: Date = new Date()): Promise<PublicPortfolioDto> {
    const { portfolio, business } = await loadPublished(slug)
    const logoUrl = business.logo ? `${portfolioPublicApiPath(portfolio.slug)}/logo?v=${logoVersion(business.logo.key)}` : null
    return buildPublicPortfolio(business, portfolio, readBlocks(portfolio.live?.blocks), { logoUrl, now })
}

/** Pré-visualização do dono (ou do suporte): o RASCUNHO como o visitante veria, mesmo despublicado. */
export async function getPortfolioPreview(access: AccessContext, businessId: string): Promise<PublicPortfolioDto & { published: boolean }> {
    const { business } = await readBusiness(access, businessId, "portfolio.preview")
    const portfolio = await findPortfolio(businessId)
    const logoUrl = business.logo ? `${businessLogoPath(businessId)}?v=${logoVersion(business.logo.key)}` : null
    const built = await buildPublicPortfolio(business, { slug: portfolio?.slug ?? "", indexable: portfolio?.indexable ?? false }, readBlocks(portfolio?.draft?.blocks), { logoUrl })
    return { ...built, published: Boolean(portfolio?.published) && business.status === "active" }
}

/** Logo do portfólio publicado (favicon e Open Graph): URL estável, servida pelo app. */
export async function publicPortfolioLogo(slug: string): Promise<Response> {
    const { business } = await loadPublished(slug)
    if (!business.logo) throw new DomainError(404, "O negócio não tem logo", "BUSINESS_LOGO_NOT_FOUND")
    let file
    try {
        file = await getFileObject(business.logo.key)
    } catch (error) {
        if (storageErrorInfo(error).kind === "not_found") throw new DomainError(404, "O negócio não tem logo", "BUSINESS_LOGO_NOT_FOUND")
        throw new DomainError(502, "Não foi possível carregar a logo. Tente novamente em instantes.", "STORAGE_UNAVAILABLE")
    }
    const headers: Record<string, string> = {
        "Content-Type": business.logo.mediaType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(business.logo.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
        "Cache-Control": "public, max-age=300",
    }
    if (file.contentLength != null) headers["Content-Length"] = String(file.contentLength)
    return new Response(file.body, { status: 200, headers })
}
