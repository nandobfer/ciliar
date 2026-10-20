import { z } from "zod"
import { expandPermissions } from "@nandobfer/perfix"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { logger } from "@/lib/logger"
import { isMockMode, sendEmail } from "@/lib/email/mailer"
import { withBasePath } from "@/lib/base-path"
import { assertCatalog, availability, loadFeature, persistFeature } from "@/features/ai/server/settings"
import type { AiFeatureAvailability } from "@/features/ai/types"
import { auditAccess, requirePermissions, roleRows } from "@/features/access/server/access"
import { parseInput } from "@/features/access/server/commands"
import type { AccessContext } from "@/features/access/server/context"
import { accessModels } from "@/features/access/server/models"
import { appOrigin } from "@/features/auth/server/origin"
import { getAiProvider } from "@/lib/ai/providers"
import { INTERVIEWER_AI_TAB, INTERVIEWER_ALERT_INTERVAL_MS, INTERVIEWER_FEATURE, type InterviewQuestionDef } from "../constants"
import { DEFAULT_INTERVIEW_SCRIPT, DEFAULT_INTERVIEWER_SETTINGS, interviewerSettingsSchema, saveInterviewScriptSchema, type InterviewerSettings } from "../schemas"
import type { InterviewerSettingsDto, InterviewScriptVersionDto } from "../types"
import { ensureBusinessCollections } from "./access"
import { businessModels } from "./models"

/** Configuração do Agente Entrevistador e roteiro versionado — SOMENTE servidor. */

export async function loadInterviewerSettings(): Promise<{ settings: InterviewerSettings; isDefault: boolean; updatedAt: Date | null }> {
    return loadFeature<InterviewerSettings>(INTERVIEWER_FEATURE, z.preprocess((saved) => (saved && typeof saved === "object" ? { ...DEFAULT_INTERVIEWER_SETTINGS, ...saved } : saved), interviewerSettingsSchema), DEFAULT_INTERVIEWER_SETTINGS)
}

export async function interviewerAvailability(settings: InterviewerSettings): Promise<AiFeatureAvailability> {
    return availability({ enabled: settings.enabled, provider: settings.main.provider, model: settings.main.model }, '"Agente Entrevistador"')
}

function normalize(input: InterviewerSettings): InterviewerSettings {
    const supportsSampling = input.main.provider ? getAiProvider(input.main.provider).supportsSampling : false
    return {
        ...input,
        main: {
            ...input.main,
            variant: input.main.variant || null,
            temperature: supportsSampling ? input.main.temperature : null,
            maxOutputTokens: supportsSampling ? input.main.maxOutputTokens : null,
        },
    }
}

type ScriptDoc = { version: number; questions: InterviewQuestionDef[]; notes: string; createdBy: string; createdAt: Date }

const cleanQuestions = (questions: readonly InterviewQuestionDef[]): InterviewQuestionDef[] =>
    questions.map((question) => ({ field: question.field, prompt: question.prompt, required: Boolean(question.required), active: Boolean(question.active) }))

/** Versão vigente do roteiro (a 0 é o roteiro padrão, enquanto nada foi gravado). */
export async function currentInterviewScript(): Promise<{ version: number; questions: InterviewQuestionDef[] }> {
    await dbConnect()
    const doc = await businessModels().scripts.findOne().sort({ version: -1 }).lean<ScriptDoc>()
    return doc ? { version: doc.version, questions: cleanQuestions(doc.questions) } : { version: 0, questions: cleanQuestions(DEFAULT_INTERVIEW_SCRIPT) }
}

async function names(ids: string[]): Promise<Map<string, string>> {
    const valid = [...new Set(ids)].filter((id) => /^[a-f\d]{24}$/i.test(id))
    if (!valid.length) return new Map()
    const users = await accessModels().users.find({ _id: { $in: valid } }).select({ name: 1 }).lean()
    return new Map(users.map((user) => [String(user._id), user.name]))
}

function toVersionDto(doc: ScriptDoc | null, byId: Map<string, string>): InterviewScriptVersionDto {
    if (!doc) return { version: 0, notes: "Roteiro padrão", createdBy: null, createdByName: null, createdAt: null, questions: cleanQuestions(DEFAULT_INTERVIEW_SCRIPT) }
    return { version: doc.version, notes: doc.notes ?? "", createdBy: doc.createdBy, createdByName: byId.get(doc.createdBy) ?? null, createdAt: new Date(doc.createdAt).toISOString(), questions: cleanQuestions(doc.questions) }
}

export async function getInterviewScriptVersion(version: number): Promise<InterviewScriptVersionDto | null> {
    await dbConnect()
    if (version === 0) return toVersionDto(null, new Map())
    const doc = await businessModels().scripts.findOne({ version }).lean<ScriptDoc>()
    if (!doc) return null
    return toVersionDto(doc, await names([doc.createdBy]))
}

export async function getInterviewerSettings(): Promise<InterviewerSettingsDto> {
    await dbConnect()
    const [{ settings, isDefault, updatedAt }, docs, alert] = await Promise.all([
        loadInterviewerSettings(),
        businessModels().scripts.find().sort({ version: -1 }).limit(200).lean<ScriptDoc[]>(),
        businessModels().alerts.findById("global").lean(),
    ])
    const byId = await names(docs.map((doc) => doc.createdBy))
    const history = [...docs.map((doc) => toVersionDto(doc, byId)), toVersionDto(null, byId)].map((item) => ({ version: item.version, notes: item.notes, createdBy: item.createdBy, createdByName: item.createdByName, createdAt: item.createdAt }))
    return {
        settings,
        isDefault,
        availability: await interviewerAvailability(settings),
        updatedAt: updatedAt ? updatedAt.toISOString() : null,
        script: toVersionDto(docs[0] ?? null, byId),
        history,
        lastUnavailableAt: alert?.lastUnavailableAt ? new Date(alert.lastUnavailableAt).toISOString() : null,
        lastUnavailableReason: alert?.lastReason ?? null,
    }
}

export async function saveInterviewerSettings(access: AccessContext, raw: unknown): Promise<InterviewerSettingsDto> {
    requirePermissions(access, "admin.access", "integrations.ai.edit")
    const next = normalize(parseInput(interviewerSettingsSchema, raw))
    await assertCatalog({ enabled: next.enabled, provider: next.main.provider, model: next.main.model, variant: next.main.variant, agent: null, temperature: null, maxOutputTokens: null })
    const before = await loadInterviewerSettings()
    await persistFeature(INTERVIEWER_FEATURE, next, access.userId, before)
    return getInterviewerSettings()
}

/** Cada gravação cria uma versão nova (imutável). Conflito se outra gravação aconteceu desde a abertura. */
export async function saveInterviewScript(access: AccessContext, raw: unknown): Promise<InterviewerSettingsDto> {
    requirePermissions(access, "admin.access", "integrations.ai.edit")
    const { questions, notes, version } = parseInput(saveInterviewScriptSchema, raw)
    await dbConnect()
    await ensureBusinessCollections()
    const current = await currentInterviewScript()
    if (current.version !== version) throw new DomainError(409, "O roteiro foi alterado por outra pessoa. Recarregue e revise antes de salvar.", "VERSION_CONFLICT")
    const next = version + 1
    try {
        await businessModels().scripts.create({ version: next, questions: cleanQuestions(questions), notes, createdBy: access.userId })
    } catch (error) {
        if (typeof error === "object" && error && "code" in error && error.code === 11000) throw new DomainError(409, "O roteiro foi alterado por outra pessoa. Recarregue e revise antes de salvar.", "VERSION_CONFLICT")
        throw error
    }
    await auditAccess(access, "interview_script.update", "interview-script", { version }, { version: next, questions: questions.map((question) => `${question.field}:${question.active ? "ativa" : "inativa"}:${question.required ? "obrigatória" : "opcional"}`), notes })
    return getInterviewerSettings()
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!)

/**
 * IA indisponível na entrevista: registra o momento (aviso na aba do Entrevistador) e avisa por
 * e-mail (SMTP; no máximo 1 por hora) os usuários ativos que podem configurar (`integrations.ai.edit`).
 * Nunca lança: o bloqueio da tela não depende do alerta.
 */
export async function notifyInterviewerUnavailable(reason: string, now: Date = new Date()): Promise<"sent" | "throttled" | "no-smtp" | "no-recipients" | "failed"> {
    try {
        await dbConnect()
        const { alerts } = businessModels()
        await alerts.updateOne({ _id: "global" }, { $set: { lastUnavailableAt: now, lastReason: reason } }, { upsert: true })
        const claimed = await alerts.findOneAndUpdate(
            { _id: "global", $or: [{ lastSentAt: null }, { lastSentAt: { $lte: new Date(now.getTime() - INTERVIEWER_ALERT_INTERVAL_MS) } }] },
            { $set: { lastSentAt: now } },
            { returnDocument: "after" },
        )
        if (!claimed) return "throttled"
        if (await isMockMode()) return "no-smtp"
        const roles = await roleRows()
        const users = await accessModels().users.find({ active: true }).select({ name: 1, email: 1, roles: 1 }).lean()
        const recipients = users.filter((user) => {
            const effective = expandPermissions(roles.filter((role) => role.ativo && user.roles.includes(role.id)))
            return effective.has("*") || effective.has("integrations.ai.edit")
        })
        if (!recipients.length) return "no-recipients"
        const link = `${appOrigin()}${withBasePath(`/integracoes/ia?aba=${INTERVIEWER_AI_TAB}`)}`
        const html = [
            "<p>O <strong>Agente Entrevistador</strong> do Ciliar está indisponível e usuários estão bloqueados na criação de negócios.</p>",
            `<p>Motivo: ${escapeHtml(reason)}</p>`,
            `<p>Configure em <a href="${escapeHtml(link)}">${escapeHtml(link)}</a>.</p>`,
        ].join("")
        for (const user of recipients) await sendEmail(user.email, "Ciliar: Agente Entrevistador indisponível", html)
        return "sent"
    } catch (error) {
        logger.warn({ err: error, module: "businesses" }, "[entrevistador] falha ao alertar sobre a IA indisponível")
        return "failed"
    }
}
