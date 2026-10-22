import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { copyFile } from "@/lib/storage/s3"
import type { AccessContext } from "@/features/access/server/context"
import { DEFAULT_CURRENCY, type BusinessField, type BusinessType, type Currency } from "../../constants"
import type { AvailabilityDay, BusinessGoalInput } from "../../schemas"
import { auditBusiness, businessTransaction } from "../access"
import { assertBusinessVacancy, insertBusiness, publishBusinessesChanged, removeObjectsQuietly } from "../businesses"
import { businessModels, type BusinessLogo } from "../models"
import { loadInterviewImage } from "./files"
import { isInterviewDone, loadInterview, type InterviewDoc } from "./state"

/**
 * Conclusão da entrevista: ao responder a última pergunta, o Negócio é criado direto (sem tela de
 * revisão), numa transação com o fence do dono que confere a vaga no limite do perfil. A logo é
 * copiada antes (o storage não participa da transação) e removida se a transação falhar.
 */

function answered<T>(doc: InterviewDoc, field: BusinessField): T | null {
    const answer = doc.answers?.[field]
    return answer?.status === "answered" ? (answer.value as T) : null
}

export async function completeInterview(interviewId: string, access: AccessContext): Promise<{ businessId: string; name: string } | null> {
    const doc = await loadInterview(interviewId, access)
    if (doc.status !== "in_progress" || !isInterviewDone(doc)) return null
    const businessId = new Types.ObjectId()
    let logo: BusinessLogo | null = null
    const logoAnswer = answered<{ fileId: string }>(doc, "logo")
    if (logoAnswer?.fileId) {
        const file = await loadInterviewImage(doc._id, logoAnswer.fileId)
        const key = `businesses/${businessId.toString()}/logo/${file._id.toString()}-${file.name}`
        try {
            await copyFile(file.key, key)
        } catch {
            throw new DomainError(502, "Não foi possível copiar a logo no storage. Tente novamente em instantes.", "STORAGE_UNAVAILABLE")
        }
        logo = { key, name: file.name, mediaType: file.mediaType, size: file.size }
    }
    let name = ""
    try {
        await businessTransaction(access, ["businesses.use", "businesses.create"], async (current, session, ownerId) => {
            const fresh = await businessModels().interviews.findOne({ _id: doc._id, ownerId, status: "in_progress" }).session(session).lean<InterviewDoc>()
            if (!fresh) throw new DomainError(409, "A entrevista já foi concluída ou descartada.", "INTERVIEW_COMPLETED")
            if (!isInterviewDone(fresh)) throw new DomainError(409, "Ainda há perguntas pendentes.", "INTERVIEW_PENDING")
            await assertBusinessVacancy(current, session)
            const goals = answered<BusinessGoalInput[]>(fresh, "goals") ?? []
            const id = await insertBusiness(
                current,
                session,
                ownerId,
                {
                    name: answered<string>(fresh, "name"),
                    type: answered<BusinessType>(fresh, "type"),
                    subtype: fresh.subtype ?? null,
                    segment: answered<string>(fresh, "segment"),
                    description: answered<string>(fresh, "description"),
                    logo,
                    links: answered<string[]>(fresh, "links") ?? [],
                    availability: answered<AvailabilityDay[]>(fresh, "availability") ?? [],
                    currency: answered<Currency>(fresh, "currency") ?? DEFAULT_CURRENCY,
                    interviewId: fresh._id.toString(),
                },
                goals,
                businessId,
            )
            const created = await businessModels().businesses.findById(id).session(session).select({ name: 1 }).lean()
            name = created?.name ?? ""
            await businessModels().interviews.updateOne({ _id: fresh._id }, { $set: { status: "completed", businessId: id, completedAt: new Date() } }, { session })
            await auditBusiness(current, "business.create", id, null, { name, ownerId, interviewId: fresh._id.toString(), scriptVersion: fresh.scriptVersion, goals: goals.length }, session)
            await auditBusiness(current, "interview.complete", fresh._id.toString(), null, { businessId: id, ownerId }, session)
        })
    } catch (error) {
        if (logo) await removeObjectsQuietly([logo.key])
        throw error
    }
    await publishBusinessesChanged(doc.ownerId, businessId.toString())
    return { businessId: businessId.toString(), name }
}
