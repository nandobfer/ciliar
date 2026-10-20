import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import type { AccessContext } from "@/features/access/server/context"
import { forgetSession, liveMessageOf, subscribeSession } from "@/features/opex-agent/server/hub"
import type { OpexStreamLine } from "@/features/opex-agent/types"
import type { InterviewProgressDto, InterviewStatusDto, InterviewTranscriptDto } from "../../types"
import { auditBusiness, businessOwnerOf, canSupportBusinesses, ensureBusinessCollections, limitReached } from "../access"
import { businessCapacity, countBusinesses, loadVisibleBusiness, publishBusinessesChanged } from "../businesses"
import { currentInterviewScript, interviewerAvailability, loadInterviewerSettings } from "../interviewer-settings"
import { businessModels } from "../models"
import { deleteInterviewFiles, interviewImageMaxBytes } from "./files"
import { assertInterviewerAvailable, startOpeningTurn } from "./runner"
import { interviewNotFound, interviewTranscript, loadInterview, progressOf, scopeOf, type InterviewDoc, type InterviewScope } from "./state"

/** Entrevistas do Agente Entrevistador — SOMENTE servidor. */

export async function interviewStatus(): Promise<InterviewStatusDto> {
    const { settings } = await loadInterviewerSettings()
    const status = await interviewerAvailability(settings)
    return { available: status.available, reason: status.available ? null : "A criação de negócios está indisponível no momento. Tente mais tarde.", maxImageMb: Math.round((await interviewImageMaxBytes()) / 1024 / 1024) }
}

async function canDiscardFor(access: AccessContext): Promise<boolean> {
    return (await countBusinesses(businessOwnerOf(access))).active > 0
}

export async function interviewProgress(id: string, access: AccessContext): Promise<InterviewProgressDto> {
    const doc = await loadInterview(id, access)
    return progressOf(doc, await canDiscardFor(access))
}

/** Entrevista em andamento do dono efetivo (`null` se não houver). */
export async function currentInterview(access: AccessContext): Promise<InterviewProgressDto | null> {
    await dbConnect()
    const doc = await businessModels().interviews.findOne({ ownerId: businessOwnerOf(access), status: "in_progress" }).lean<InterviewDoc>()
    return doc ? progressOf(doc, await canDiscardFor(access)) : null
}

/**
 * Começa (ou retoma) a entrevista: uma em andamento por dono, com a versão vigente do roteiro.
 * Exige vaga no limite (o servidor confere de novo na conclusão) e a IA disponível.
 */
export async function startInterview(access: AccessContext): Promise<InterviewProgressDto> {
    await dbConnect()
    await ensureBusinessCollections()
    const ownerId = businessOwnerOf(access)
    const { interviews } = businessModels()
    const existing = await interviews.findOne({ ownerId, status: "in_progress" }).lean<InterviewDoc>()
    if (existing) return progressOf(existing, await canDiscardFor(access))
    const capacity = await businessCapacity(access)
    if (!capacity.canCreate) throw limitReached(capacity.limit)
    await assertInterviewerAvailable()
    const script = await currentInterviewScript()
    let doc: InterviewDoc
    try {
        const created = await interviews.create({ ownerId, startedBy: access.userId, scriptVersion: script.version, questions: script.questions, answers: {}, status: "in_progress" })
        doc = created.toObject() as InterviewDoc
    } catch (error) {
        // Duas abas ao mesmo tempo: o índice único garante uma entrevista só.
        if (typeof error === "object" && error && "code" in error && error.code === 11000) {
            const again = await interviews.findOne({ ownerId, status: "in_progress" }).lean<InterviewDoc>()
            if (again) return progressOf(again, await canDiscardFor(access))
        }
        throw error
    }
    await auditBusiness(access, "interview.start", doc._id.toString(), null, { ownerId, scriptVersion: script.version })
    await startOpeningTurn(doc._id.toString(), scopeOf(access)).catch(() => undefined)
    await publishBusinessesChanged(ownerId, doc._id.toString())
    return progressOf(doc, capacity.active > 0)
}

/** Descartar (apaga respostas, transcrição e imagens) só com outro negócio ativo. */
export async function discardInterview(id: string, access: AccessContext): Promise<{ id: string }> {
    const doc = await loadInterview(id, access)
    if (doc.status !== "in_progress") throw new DomainError(409, "A entrevista já foi concluída.", "INTERVIEW_COMPLETED")
    if (!(await canDiscardFor(access))) throw new DomainError(409, "Sem um negócio ativo, a entrevista é obrigatória: não pode ser descartada.", "INTERVIEW_REQUIRED")
    forgetSession(id)
    await deleteInterviewFiles(doc._id)
    const { interviews, interviewMessages } = businessModels()
    await interviewMessages.deleteMany({ interviewId: doc._id })
    await interviews.deleteOne({ _id: doc._id, status: "in_progress" })
    await auditBusiness(access, "interview.discard", id, { ownerId: doc.ownerId, answers: Object.keys(doc.answers ?? {}) }, null)
    await publishBusinessesChanged(doc.ownerId, id)
    return { id }
}

/** Transcrição da entrevista que criou o negócio (dono ou suporte, auditado). */
export async function businessInterviewTranscript(access: AccessContext, businessId: string): Promise<InterviewTranscriptDto> {
    const { doc: business, own } = await loadVisibleBusiness(access, businessId)
    const interview = business.interviewId ? await businessModels().interviews.findById(business.interviewId).lean<InterviewDoc>() : null
    if (!interview) throw interviewNotFound()
    if (!own && !canSupportBusinesses(access)) throw interviewNotFound()
    return { interview: progressOf(interview, false), messages: await interviewTranscript(interview) }
}

const PING_MS = 15_000

/** Stream NDJSON da entrevista (mesmo protocolo do Agente Opex: `snapshot`, linhas ao vivo e `ping`). */
export async function openInterviewStream(id: string, signal: AbortSignal, access: AccessContext): Promise<Response> {
    const doc = await loadInterview(id, access)
    const encoder = new TextEncoder()
    let cleanup = () => {}
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let open = true
            const write = (line: OpexStreamLine) => {
                if (!open) return
                try {
                    controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))
                } catch {
                    open = false
                }
            }
            const unsubscribe = subscribeSession(id, write)
            const live = liveMessageOf(id)
            write({ type: "snapshot", status: live ? "running" : doc.sessionStatus === "running" ? "idle" : doc.sessionStatus, live })
            const ping = setInterval(() => write({ type: "ping" }), PING_MS)
            ping.unref?.()
            cleanup = () => {
                if (!open) return
                open = false
                clearInterval(ping)
                unsubscribe()
                try {
                    controller.close()
                } catch {
                    // já fechado
                }
            }
            signal.addEventListener("abort", cleanup, { once: true })
        },
        cancel() {
            cleanup()
        },
    })
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } })
}

export type { InterviewScope }
