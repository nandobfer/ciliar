import { Types, type ClientSession } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { parseInput } from "@/features/access/server/commands"
import type { AccessContext } from "@/features/access/server/context"
import { auditBusiness } from "@/features/businesses/server/access"
import { businessFilePath, claimBusinessFiles, type BusinessFileDoc } from "@/features/businesses/server/files"
import { readBusiness, writeItem } from "@/features/businesses/server/items"
import { businessModels } from "@/features/businesses/server/models"
import { mediaIdsOf, type PortfolioBlock } from "../blocks"
import { PORTFOLIO_MEDIA_OWNER } from "../constants"
import { portfolioMediaAddSchema } from "../schemas"
import type { PortfolioMediaDto } from "../types"

/**
 * Mídia do portfólio (M5): imagens enviadas para os blocos Imagem, Galeria e Depoimento, reaproveitáveis
 * na página. Arquivos `purpose: media` vinculados ao marcador `PORTFOLIO_MEDIA_OWNER`. Excluir é
 * recusado enquanto a imagem estiver no rascunho ou no publicado; publicações antigas que a usavam
 * mostram o espaço vazio ao restaurar.
 */

const MEDIA_FILTER = (businessId: string) => ({ businessId, purpose: "media" as const, pending: false, itemId: PORTFOLIO_MEDIA_OWNER })

export const toMediaDto = (businessId: string, doc: Pick<BusinessFileDoc, "_id" | "name" | "mediaType" | "size"> & { createdAt?: Date }): PortfolioMediaDto => ({
    id: doc._id.toString(),
    name: doc.name,
    mediaType: doc.mediaType,
    size: doc.size,
    url: businessFilePath(businessId, doc._id.toString()),
    createdAt: (doc.createdAt ? new Date(doc.createdAt) : new Date(0)).toISOString(),
})

export async function loadMedia(businessId: string, session: ClientSession | null = null): Promise<(BusinessFileDoc & { createdAt?: Date })[]> {
    return businessModels().files.find({ ...MEDIA_FILTER(businessId), ready: true }).sort({ createdAt: -1 }).session(session).lean<(BusinessFileDoc & { createdAt?: Date })[]>()
}

export async function listPortfolioMedia(access: AccessContext, businessId: string): Promise<PortfolioMediaDto[]> {
    await readBusiness(access, businessId, "portfolio.media")
    return (await loadMedia(businessId)).map((doc) => toMediaDto(businessId, doc))
}

/** Acrescenta à mídia os arquivos já enviados (`purpose: media`, ainda pendentes). */
export async function addPortfolioMedia(access: AccessContext, businessId: string, raw: unknown): Promise<PortfolioMediaDto[]> {
    const { fileIds } = parseInput(portfolioMediaAddSchema, raw)
    const added = await writeItem(access, businessId, "portfolio", async ({ current, session }) => {
        const docs = await claimBusinessFiles(session, businessId, "media", PORTFOLIO_MEDIA_OWNER, fileIds)
        await auditBusiness(current, "business.portfolio.media_add", businessId, null, { files: docs.map((doc) => doc.name) }, session)
        return { result: docs }
    })
    return added.map((doc) => toMediaDto(businessId, doc))
}

/** Exclui uma imagem da mídia (recusado se estiver em uso no rascunho ou no publicado). */
export async function deletePortfolioMedia(access: AccessContext, businessId: string, fileId: string): Promise<{ id: string }> {
    if (!Types.ObjectId.isValid(fileId)) throw new DomainError(404, "Imagem não encontrada na mídia", "PORTFOLIO_MEDIA_NOT_FOUND")
    await writeItem(access, businessId, "portfolio", async ({ current, session }) => {
        const models = businessModels()
        const doc = await models.files.findOne({ ...MEDIA_FILTER(businessId), _id: fileId }).session(session).lean<BusinessFileDoc & { _id: Types.ObjectId }>()
        if (!doc) throw new DomainError(404, "Imagem não encontrada na mídia", "PORTFOLIO_MEDIA_NOT_FOUND")
        const portfolio = await models.portfolios.findOne({ businessId }).session(session).lean()
        const used = new Set([...mediaIdsOf((portfolio?.draft?.blocks ?? []) as unknown as PortfolioBlock[]), ...mediaIdsOf((portfolio?.live?.blocks ?? []) as unknown as PortfolioBlock[])])
        if (used.has(fileId)) throw new DomainError(409, "A imagem está em uso na página (rascunho ou publicada). Tire-a dos blocos antes de excluir.", "PORTFOLIO_MEDIA_IN_USE")
        await models.files.deleteOne({ _id: doc._id }, { session })
        await auditBusiness(current, "business.portfolio.media_delete", businessId, { file: doc.name }, null, session)
        return { result: undefined, removeKeys: [doc.key, doc.uploadKey] }
    })
    return { id: fileId }
}
