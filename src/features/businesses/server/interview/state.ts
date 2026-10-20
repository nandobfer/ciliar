import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { resolveAccess } from "@/features/access/server/access"
import type { AccessContext } from "@/features/access/server/context"
import type { OpexFileDto, OpexMessageDto, OpexSessionDetailDto, OpexSessionDto } from "@/features/opex-agent/types"
import { opexFileKind } from "@/features/opex-agent/files"
import { isTurnActive } from "@/features/opex-agent/server/hub"
import { BUSINESS_FIELD_LABELS, type BusinessField, type InterviewQuestionDef } from "../../constants"
import { formatFieldValue } from "../../format"
import type { InterviewAnswerStatus, InterviewProgressDto } from "../../types"
import { businessOwnerOf, canSupportBusinesses, requireBusinessUse } from "../access"
import { businessModels, type InterviewFileRef, type InterviewMessageRecord, type InterviewRecord } from "../models"

/**
 * Estado da entrevista — SOMENTE servidor. O escopo guarda só quem pediu (usuário real, marcador da
 * simulação e versão da sessão); o acesso é relido no banco no início do turno e antes de cada
 * ferramenta (`resolveInterviewAccess`). O dono da entrevista é o dono efetivo (`businessOwnerOf`).
 */
export interface InterviewScope {
    userId: string
    viewAsHeader: string
    sessionVersion: number
}

export const scopeOf = (access: AccessContext): InterviewScope => ({ userId: access.userId, viewAsHeader: access.viewAsHeader, sessionVersion: access.sessionVersion })

export async function resolveInterviewAccess(scope: InterviewScope): Promise<AccessContext> {
    const access = await resolveAccess(scope.userId, scope.viewAsHeader, null, scope.sessionVersion)
    if (access.legalAcceptanceRequired) throw new DomainError(403, "Aceite os termos de uso e a política de privacidade para continuar", "TERMS_ACCEPTANCE_REQUIRED")
    requireBusinessUse(access)
    return access
}

export type InterviewDoc = InterviewRecord & { _id: Types.ObjectId }
export type InterviewMessageDoc = InterviewMessageRecord & { _id: Types.ObjectId }

export const interviewNotFound = () => new DomainError(404, "Entrevista não encontrada", "INTERVIEW_NOT_FOUND")

export function assertInterviewId(id: string): void {
    if (!Types.ObjectId.isValid(id)) throw interviewNotFound()
}

/** Servidor reiniciou no meio do turno: volta a ociosa com o aviso, para a entrevista não ficar presa. */
async function reconcile(doc: InterviewDoc): Promise<InterviewDoc> {
    if (doc.sessionStatus !== "running" || isTurnActive(doc._id.toString())) return doc
    const lastError = "A resposta foi interrompida (o servidor reiniciou durante o turno)."
    await businessModels().interviews.updateOne({ _id: doc._id, sessionStatus: "running" }, { $set: { sessionStatus: "error", lastError } })
    return { ...doc, sessionStatus: "error", lastError }
}

/** Entrevista do dono efetivo (de outro dono responde 404). */
export async function loadInterview(id: string, access: AccessContext): Promise<InterviewDoc> {
    assertInterviewId(id)
    await dbConnect()
    const doc = await businessModels().interviews.findOne({ _id: id, ownerId: businessOwnerOf(access) }).lean<InterviewDoc>()
    if (!doc) throw interviewNotFound()
    return reconcile(doc)
}

export async function loadInterviewRaw(id: string): Promise<InterviewDoc | null> {
    assertInterviewId(id)
    return businessModels().interviews.findById(id).lean<InterviewDoc>()
}

export const activeQuestions = (doc: Pick<InterviewRecord, "questions">): InterviewQuestionDef[] => doc.questions.filter((question) => question.active)

export function answerStatus(doc: Pick<InterviewRecord, "answers">, field: BusinessField): InterviewAnswerStatus {
    return doc.answers?.[field]?.status ?? "pending"
}

/** Próxima pergunta pendente, na ordem do roteiro (`null` = todas respondidas ou puladas). */
export function nextQuestion(doc: Pick<InterviewRecord, "questions" | "answers">): InterviewQuestionDef | null {
    return activeQuestions(doc).find((question) => answerStatus(doc, question.field) === "pending") ?? null
}

export function isInterviewDone(doc: Pick<InterviewRecord, "questions" | "answers">): boolean {
    return activeQuestions(doc).every((question) => {
        const status = answerStatus(doc, question.field)
        return status === "answered" || (status === "skipped" && !question.required)
    })
}

function currencyOf(doc: Pick<InterviewRecord, "answers">): string {
    const value = doc.answers?.currency?.status === "answered" ? doc.answers.currency.value : null
    return typeof value === "string" ? value : "BRL"
}

export function progressOf(doc: InterviewDoc, canDiscard: boolean): InterviewProgressDto {
    const next = nextQuestion(doc)
    const currency = currencyOf(doc)
    return {
        id: doc._id.toString(),
        status: doc.status,
        scriptVersion: doc.scriptVersion,
        questions: activeQuestions(doc).map((question) => {
            const answer = doc.answers?.[question.field]
            return {
                ...question,
                status: answer?.status ?? "pending",
                display: answer?.status === "answered" ? formatFieldValue(question.field, answer.value, currency) : null,
                current: doc.status === "in_progress" && next?.field === question.field,
            }
        }),
        subtype: doc.subtype ?? null,
        businessId: doc.businessId ?? null,
        canDiscard: doc.status === "in_progress" && canDiscard,
        // Imagem só na pergunta da logo/foto (ou para corrigi-la depois de respondida/pulada).
        acceptsImage: doc.status === "in_progress" && activeQuestions(doc).some((question) => question.field === "logo") && (next?.field === "logo" || answerStatus(doc, "logo") !== "pending"),
        startedAt: new Date(doc.createdAt).toISOString(),
        completedAt: doc.completedAt ? new Date(doc.completedAt).toISOString() : null,
    }
}

/** Situação do roteiro enviada ao modelo a cada turno (fim da mensagem do usuário). */
export function progressContext(doc: InterviewDoc): string {
    const next = nextQuestion(doc)
    const currency = currencyOf(doc)
    const lines = activeQuestions(doc).map((question, index) => {
        const answer = doc.answers?.[question.field]
        const status = answer?.status === "answered" ? `respondida: ${formatFieldValue(question.field, answer.value, currency)}` : answer?.status === "skipped" ? "pulada" : "pendente"
        return `${index + 1}. ${BUSINESS_FIELD_LABELS[question.field]} (campo ${question.field}, ${question.required ? "obrigatória" : "opcional"}) — ${status}. Orientação: ${question.prompt}`
    })
    return [
        "Roteiro da entrevista e situação atual:",
        ...lines,
        `Subtipo interpretado: ${doc.subtype ?? "(não definido)"}.`,
        next ? `PRÓXIMA PERGUNTA: ${BUSINESS_FIELD_LABELS[next.field]} (campo ${next.field}).` : "Todas as perguntas foram respondidas ou puladas.",
    ].join("\n")
}

// ── DTOs no formato do chat do Agente Opex (componentes reaproveitados) ─────

export const interviewFilePath = (id: string) => `/api/interview/files/${id}`

export function toInterviewFileDto(file: InterviewFileRef): OpexFileDto {
    return { id: file.id, name: file.name, mediaType: file.mediaType, size: file.size, kind: opexFileKind(file.mediaType, file.name), url: interviewFilePath(file.id) }
}

export function toInterviewMessageDto(doc: InterviewMessageDoc): OpexMessageDto {
    return {
        id: doc._id.toString(),
        role: doc.role,
        kind: "message",
        text: doc.text ?? "",
        files: (doc.files ?? []).map(toInterviewFileDto),
        parts: doc.parts ?? [],
        status: doc.status ?? "complete",
        error: doc.error ?? null,
        usage: doc.usage ?? null,
        durationMs: doc.durationMs ?? null,
        model: doc.model ?? null,
        createdAt: new Date(doc.createdAt).toISOString(),
    }
}

export function toInterviewSessionDto(doc: InterviewDoc): OpexSessionDto {
    return {
        id: doc._id.toString(),
        title: "Entrevista do novo negócio",
        summary: "",
        titleSource: "auto",
        status: doc.sessionStatus ?? "idle",
        lastError: doc.lastError ?? null,
        archived: false,
        messageCount: doc.messageCount ?? 0,
        lastMessageAt: new Date(doc.lastMessageAt ?? doc.createdAt).toISOString(),
        createdAt: new Date(doc.createdAt).toISOString(),
    }
}

/** Mensagens visíveis (a abertura automática `system` não aparece). */
export async function interviewMessages(interviewId: Types.ObjectId): Promise<InterviewMessageDoc[]> {
    return businessModels().interviewMessages.find({ interviewId, kind: { $ne: "system" } }).sort({ seq: 1 }).select({ modelMessages: 0 }).lean<InterviewMessageDoc[]>()
}

export async function getInterviewDetail(id: string, access: AccessContext): Promise<OpexSessionDetailDto> {
    const doc = await loadInterview(id, access)
    const messages = await interviewMessages(doc._id)
    return { session: toInterviewSessionDto(doc), messages: messages.map(toInterviewMessageDto) }
}

/** Transcrição de uma entrevista concluída (dono ou suporte `businesses.view_all`). */
export async function interviewTranscript(doc: InterviewDoc) {
    const messages = await interviewMessages(doc._id)
    return messages.map((message) => ({ role: message.role, text: message.text, files: (message.files ?? []).map((file) => ({ name: file.name })), createdAt: new Date(message.createdAt).toISOString() }))
}

export { canSupportBusinesses }
