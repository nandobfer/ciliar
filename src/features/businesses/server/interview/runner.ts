import { isLoopFinished, streamText, type ModelMessage } from "ai"
import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { recordAiConsumption } from "@/lib/ai/consumption"
import { describeAiError, prepareModel, samplingOptions, type PreparedModel } from "@/lib/ai/stream"
import { loggerFor } from "@/lib/logger"
import { selectHistory, stripPastReasoning, withTurnContext } from "@/features/opex-agent/history"
import { closeRunningTools, partsText } from "@/features/opex-agent/live-message"
import { abortTurn, beginTurn, endTurn, isTurnActive, liveMessageOf, publishLine } from "@/features/opex-agent/server/hub"
import { stringifyForDisplay } from "@/features/opex-agent/server/tool-runtime"
import { nowContext } from "@/features/opex-agent/server/tools/context"
import type { OpexMessageDto, OpexMessageStatus, OpexPart, OpexUsageDto } from "@/features/opex-agent/types"
import { INTERVIEWER_CONSUMPTION_ORIGIN } from "../../constants"
import type { InterviewerSettings } from "../../schemas"
import { businessModels, type InterviewFileRef } from "../models"
import { interviewerAvailability, loadInterviewerSettings, notifyInterviewerUnavailable } from "../interviewer-settings"
import { claimInterviewFiles } from "./files"
import { activeQuestions, loadInterview, progressContext, resolveInterviewAccess, toInterviewMessageDto, type InterviewDoc, type InterviewMessageDoc, type InterviewScope } from "./state"
import { buildInterviewTools, interviewToolLabel } from "./tools"

/**
 * Turnos do Agente Entrevistador — mesmo motor do Agente Opex (turno em segundo plano, barramento
 * `hub` em memória, stream NDJSON e reconexão pelo retrato): fechar a aba não perde a resposta e a
 * entrevista retoma de onde parou. Sem confirmações, título nem resumo.
 */

const log = loggerFor({ module: "businesses", feature: "interviewer" })
const INTERRUPTED = "Interrompido pelo usuário"
const OPENING = "(Início da entrevista: cumprimente o usuário, diga que os dados poderão ser alterados depois no espaço do negócio e faça a primeira pergunta.)"

function instructionsFor(settings: InterviewerSettings, userName: string): string {
    return [
        settings.instructions,
        "",
        `Usuário: ${userName}. O roteiro, a situação de cada pergunta e a próxima pergunta vêm ao fim de cada mensagem do usuário.`,
        "Cada campo tem a sua ferramenta de gravação (set_name, set_type, set_segment, set_description, set_links, set_availability, set_goals, set_currency, attach_logo); skip_question pula uma opcional e set_subtype grava o subtipo interpretado. Só existem as ferramentas dos campos deste roteiro.",
    ].join("\n")
}

/** Ao vivo: a IA indisponível bloqueia a entrevista (sem formulário de contingência) e o admin é alertado. */
export async function assertInterviewerAvailable(): Promise<InterviewerSettings> {
    const { settings } = await loadInterviewerSettings()
    const status = await interviewerAvailability(settings)
    if (!status.available) {
        void notifyInterviewerUnavailable(status.reason ?? "Agente Entrevistador indisponível")
        throw new DomainError(409, "A criação de negócios está indisponível no momento. Tente mais tarde.", "INTERVIEW_UNAVAILABLE")
    }
    return settings
}

interface TurnInput {
    text: string
    kind: "message" | "system"
    fileIds?: string[]
}

async function startTurn(interviewId: string, input: TurnInput, scope: InterviewScope): Promise<OpexMessageDto> {
    const access = await resolveInterviewAccess(scope)
    const doc = await loadInterview(interviewId, access)
    if (doc.status !== "in_progress") throw new DomainError(409, "A entrevista já foi concluída.", "INTERVIEW_COMPLETED")
    const settings = await assertInterviewerAvailable()
    const { interviews, interviewMessages } = businessModels()
    const claimed = await interviews.findOneAndUpdate(
        { _id: doc._id, status: "in_progress", sessionStatus: { $ne: "running" } },
        { $set: { sessionStatus: "running", lastError: null, lastMessageAt: new Date() }, $inc: { nextSeq: 2, messageCount: 2 } },
        { returnDocument: "before" },
    ).lean<InterviewDoc>()
    if (!claimed || isTurnActive(interviewId)) {
        if (claimed) await interviews.updateOne({ _id: doc._id }, { $inc: { nextSeq: -2, messageCount: -2 } })
        throw new DomainError(409, "O entrevistador ainda está respondendo: aguarde ou pare a resposta.", "INTERVIEW_BUSY")
    }
    const userId = new Types.ObjectId()
    let files: InterviewFileRef[]
    try {
        files = await claimInterviewFiles(doc._id, userId, input.fileIds ?? [])
    } catch (error) {
        await interviews.updateOne({ _id: doc._id }, { $set: { sessionStatus: claimed.sessionStatus, lastError: claimed.lastError }, $inc: { nextSeq: -2, messageCount: -2 } })
        throw error
    }
    const assistantId = new Types.ObjectId()
    const controller = new AbortController()
    beginTurn(interviewId, assistantId.toString(), controller)
    const fileNote = files.map((file) => `[Imagem enviada pelo usuário: "${file.name}" — fileId ${file.id}]`).join("\n")
    const content = [input.text, fileNote].filter(Boolean).join("\n")
    const userDoc = await interviewMessages.create({
        _id: userId,
        interviewId: doc._id,
        seq: claimed.nextSeq,
        role: "user",
        kind: input.kind,
        text: input.text,
        files,
        parts: [],
        modelMessages: JSON.stringify([{ role: "user", content }]),
        status: "complete",
    })
    void executeTurn({ interviewId, assistantId, seq: claimed.nextSeq + 1, controller, settings, scope })
    return toInterviewMessageDto(userDoc.toObject() as InterviewMessageDoc)
}

export async function sendInterviewMessage(interviewId: string, input: { text: string; fileIds?: string[] }, scope: InterviewScope): Promise<OpexMessageDto> {
    return startTurn(interviewId, { text: input.text, kind: "message", fileIds: input.fileIds }, scope)
}

/** Primeira fala do entrevistador (abertura automática, fora da transcrição). */
export async function startOpeningTurn(interviewId: string, scope: InterviewScope): Promise<void> {
    await startTurn(interviewId, { text: OPENING, kind: "system" }, scope)
}

export async function interruptInterview(interviewId: string, scope: InterviewScope): Promise<void> {
    const access = await resolveInterviewAccess(scope)
    const doc = await loadInterview(interviewId, access)
    if (!abortTurn(interviewId, INTERRUPTED)) await businessModels().interviews.updateOne({ _id: doc._id, sessionStatus: "running" }, { $set: { sessionStatus: "idle" } })
}

interface TurnArgs {
    interviewId: string
    assistantId: Types.ObjectId
    seq: number
    controller: AbortController
    settings: InterviewerSettings
    scope: InterviewScope
}

function parseModelMessages(json: string): unknown[] {
    try {
        const parsed: unknown = JSON.parse(json)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

async function loadHistory(doc: InterviewDoc): Promise<ModelMessage[]> {
    const stored = await businessModels().interviewMessages.find({ interviewId: doc._id }).sort({ seq: 1 }).select({ role: 1, modelMessages: 1 }).lean<Pick<InterviewMessageDoc, "role" | "modelMessages">[]>()
    const turns = stored.map((item) => ({ role: item.role, modelMessages: parseModelMessages(item.modelMessages) }))
    const messages = stripPastReasoning(selectHistory(turns, "").messages)
    const now = nowContext()
    return withTurnContext(messages, `Agora é ${now.local}. ${progressContext(doc)}`) as ModelMessage[]
}

const numberOrNull = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null)

async function executeTurn(args: TurnArgs): Promise<void> {
    const { interviewId, controller, settings, scope } = args
    const startedAt = Date.now()
    const main = settings.main
    let prepared: PreparedModel | null = null
    let errorMessage: string | null = null
    let aborted = false
    let usage: OpexUsageDto | null = null
    let responseMessages: unknown[] | null = null
    const durations = new Map<string, number>()
    const toolStarts = new Map<string, number>()

    try {
        const access = await resolveInterviewAccess(scope)
        const doc = await loadInterview(interviewId, access)
        const history = await loadHistory(doc)
        const tools = buildInterviewTools(
            activeQuestions(doc).map((question) => question.field),
            { interviewId, scope },
        )
        prepared = await prepareModel({ provider: main.provider!, model: main.model!, variant: main.variant })
        const result = streamText({
            model: prepared.model,
            instructions: instructionsFor(settings, access.name),
            messages: history,
            tools,
            stopWhen: isLoopFinished(),
            abortSignal: controller.signal,
            providerOptions: prepared.providerOptions,
            ...(prepared.reasoning ? { reasoning: prepared.reasoning } : {}),
            ...samplingOptions({ provider: main.provider!, variant: main.variant, temperature: main.temperature, maxOutputTokens: main.maxOutputTokens }),
        })
        for await (const part of result.fullStream) {
            switch (part.type) {
                case "text-delta":
                    if (part.text) publishLine(interviewId, { type: "text-delta", text: part.text })
                    break
                case "reasoning-delta":
                    publishLine(interviewId, { type: "reasoning-delta", text: part.text ?? "" })
                    break
                case "tool-input-start":
                    toolStarts.set(part.id, Date.now())
                    publishLine(interviewId, { type: "tool-start", id: part.id, name: part.toolName, group: null, label: interviewToolLabel(part.toolName) })
                    break
                case "tool-call":
                    if (!toolStarts.has(part.toolCallId)) toolStarts.set(part.toolCallId, Date.now())
                    publishLine(interviewId, { type: "tool-start", id: part.toolCallId, name: part.toolName, group: null, label: interviewToolLabel(part.toolName) })
                    publishLine(interviewId, { type: "tool-input", id: part.toolCallId, input: stringifyForDisplay(part.input) })
                    break
                case "tool-result":
                    durations.set(part.toolCallId, Date.now() - (toolStarts.get(part.toolCallId) ?? Date.now()))
                    publishLine(interviewId, { type: "tool-end", id: part.toolCallId, state: "done", output: stringifyForDisplay(part.output), error: null, confirmation: null, durationMs: durations.get(part.toolCallId) ?? null })
                    break
                case "tool-error":
                    durations.set(part.toolCallId, Date.now() - (toolStarts.get(part.toolCallId) ?? Date.now()))
                    publishLine(interviewId, {
                        type: "tool-end",
                        id: part.toolCallId,
                        state: "error",
                        output: null,
                        error: part.error instanceof Error ? part.error.message : String(part.error),
                        confirmation: null,
                        durationMs: durations.get(part.toolCallId) ?? null,
                    })
                    break
                case "error":
                    errorMessage = describeAiError(part.error)
                    break
                case "abort":
                    aborted = true
                    break
                case "finish":
                    usage = { inputTokens: numberOrNull(part.totalUsage.inputTokens), outputTokens: numberOrNull(part.totalUsage.outputTokens), totalTokens: numberOrNull(part.totalUsage.totalTokens) }
                    if (part.finishReason === "error" && !errorMessage) errorMessage = "O modelo terminou com erro"
                    break
            }
        }
        if (!aborted && !errorMessage) responseMessages = await result.responseMessages
    } catch (error) {
        if (controller.signal.aborted) aborted = true
        else {
            errorMessage = error instanceof DomainError ? error.message : describeAiError(error)
            log.warn({ interviewId, provider: main.provider, model: main.model, err: errorMessage }, "[entrevista] falha no turno")
        }
    } finally {
        await prepared?.dispose().catch(() => undefined)
    }

    await finishTurn(args, { startedAt, errorMessage, aborted, usage, responseMessages })
}

async function finishTurn(args: TurnArgs, outcome: { startedAt: number; errorMessage: string | null; aborted: boolean; usage: OpexUsageDto | null; responseMessages: unknown[] | null }): Promise<void> {
    const { interviewId, assistantId, controller, settings } = args
    const status: OpexMessageStatus = outcome.aborted ? "interrupted" : outcome.errorMessage ? "error" : "complete"
    const error = outcome.aborted ? INTERRUPTED : outcome.errorMessage
    let parts: OpexPart[] = liveMessageOf(interviewId)?.parts ?? []
    if (status !== "complete") parts = closeRunningTools(parts, error ?? "Turno encerrado")
    const text = partsText(parts)
    const { interviews, interviewMessages } = businessModels()
    try {
        const fallback = [text || "(sem resposta)", status === "interrupted" ? "\n\n[Resposta interrompida pelo usuário.]" : status === "error" ? `\n\n[A resposta falhou: ${error}]` : ""].join("")
        await interviewMessages.create({
            _id: assistantId,
            interviewId: new Types.ObjectId(interviewId),
            seq: args.seq,
            role: "assistant",
            kind: "message",
            text,
            parts,
            modelMessages: JSON.stringify(outcome.responseMessages ?? [{ role: "assistant", content: fallback }]),
            status,
            error,
            usage: outcome.usage,
            durationMs: Date.now() - outcome.startedAt,
            model: settings.main.model ? `${settings.main.provider}/${settings.main.model}` : null,
        })
        await interviews.updateOne({ _id: interviewId }, { $set: { sessionStatus: status === "error" ? "error" : "idle", lastError: status === "error" ? error : null, lastMessageAt: new Date() } })
    } catch (persistError) {
        log.error({ err: persistError, interviewId }, "[entrevista] falha ao gravar o turno")
        await interviews.updateOne({ _id: interviewId }, { $set: { sessionStatus: "error", lastError: "Não foi possível gravar a resposta" } }).catch(() => undefined)
    }
    endTurn(interviewId, controller, { type: "turn-end", messageId: assistantId.toString(), status, error })
    if (outcome.usage && settings.main.provider && settings.main.model) {
        await recordAiConsumption({
            dedupKey: `interview:${assistantId.toString()}`,
            provider: settings.main.provider,
            origin: INTERVIEWER_CONSUMPTION_ORIGIN,
            subject: interviewId,
            model: settings.main.model,
            ...outcome.usage,
            costUsd: null,
        }).catch(() => undefined)
    }
}

