import { DomainError } from "@/lib/api/route"
import { parseInput } from "@/features/access/server/commands"
import type { AccessContext } from "@/features/access/server/context"
import { setBusinessLogoSchema } from "../space-schemas"
import type { BusinessDetailDto } from "../types"
import { auditBusiness, businessOwnerOf, businessTransaction } from "./access"
import { getBusinessDetail, loadOwnedForWrite, publishBusinessesChanged, removeObjectsQuietly } from "./businesses"
import { claimBusinessFiles, importChatFile } from "./files"
import { businessModels, type BusinessLogo } from "./models"

/** Logo da ficha do negócio (M2) — SOMENTE servidor. O dashboard fica em `dashboard.ts`. */

/** Troca a logo por uma imagem já enviada (`purpose: logo`); a anterior sai do storage. */
export async function setBusinessLogo(access: AccessContext, businessId: string, raw: unknown): Promise<BusinessDetailDto> {
    const { fileId } = parseInput(setBusinessLogoSchema, raw)
    const removeKeys = await businessTransaction(access, ["businesses.use"], async (current, session, ownerId) => {
        const business = await loadOwnedForWrite(ownerId, businessId, session)
        if (business.status !== "active") throw new DomainError(409, "O negócio está arquivado: restaure-o para alterar.", "BUSINESS_ARCHIVED")
        const [file] = await claimBusinessFiles(session, businessId, "logo", businessId, [fileId])
        const logo: BusinessLogo = { key: file!.key, name: file!.name, mediaType: file!.mediaType, size: file!.size }
        // A logo vive na ficha (`businesses.logo`): o registro do envio deixa de ser necessário.
        await businessModels().files.deleteOne({ _id: file!._id }, { session })
        await businessModels().businesses.updateOne({ _id: business._id }, { $set: { logo, updatedBy: current.userId }, $inc: { version: 1 } }, { session })
        await auditBusiness(current, "business.logo.update", businessId, { logo: business.logo?.name ?? null }, { logo: logo.name }, session)
        return business.logo?.key && business.logo.key !== logo.key ? [business.logo.key] : []
    })
    await removeObjectsQuietly(removeKeys)
    await publishBusinessesChanged(businessOwnerOf(access), businessId)
    return getBusinessDetail(access, businessId)
}

export async function removeBusinessLogo(access: AccessContext, businessId: string): Promise<BusinessDetailDto> {
    const removeKeys = await businessTransaction(access, ["businesses.use"], async (current, session, ownerId) => {
        const business = await loadOwnedForWrite(ownerId, businessId, session)
        if (business.status !== "active") throw new DomainError(409, "O negócio está arquivado: restaure-o para alterar.", "BUSINESS_ARCHIVED")
        if (!business.logo) throw new DomainError(404, "O negócio não tem logo", "BUSINESS_LOGO_NOT_FOUND")
        await businessModels().businesses.updateOne({ _id: business._id }, { $set: { logo: null, updatedBy: current.userId }, $inc: { version: 1 } }, { session })
        await auditBusiness(current, "business.logo.remove", businessId, { logo: business.logo.name }, { logo: null }, session)
        return [business.logo.key]
    })
    await removeObjectsQuietly(removeKeys)
    await publishBusinessesChanged(businessOwnerOf(access), businessId)
    return getBusinessDetail(access, businessId)
}

/** Agente Opex: logo a partir de uma imagem enviada no chat. */
export async function setBusinessLogoFromChat(access: AccessContext, businessId: string, source: { key: string; name: string; mediaType: string; size: number }): Promise<BusinessDetailDto> {
    const fileId = await importChatFile(access, businessId, "logo", source)
    return setBusinessLogo(access, businessId, { fileId })
}
