import type { AiFeatureAvailability } from "@/features/ai/types"
import type { BusinessField, BusinessStatus, BusinessType, Currency, GoalMeasure, GoalMode, GoalPeriod, InterviewQuestionDef } from "./constants"
import type { InterviewerSettings } from "./schemas"

export interface BusinessLogoDto {
    name: string
    mediaType: string
    size: number
    /** Rota do conteúdo (sem `basePath`). */
    url: string
}

export interface AvailabilityDayDto {
    weekday: number
    start: string | null
    end: string | null
}

export interface BusinessGoalDto {
    id: string
    name: string | null
    targetCents: number
    period: GoalPeriod
    measure: GoalMeasure | null
    mode: GoalMode | null
    month: string | null
    year: number | null
    from: string | null
    to: string | null
}

export interface BusinessDto {
    id: string
    ownerId: string
    /** Nome do dono (útil no suporte, `businesses.view_all`). */
    ownerName: string | null
    number: number
    name: string
    type: BusinessType | null
    subtype: string | null
    segment: string | null
    description: string | null
    logo: BusinessLogoDto | null
    links: string[]
    availability: AvailabilityDayDto[]
    currency: Currency
    status: BusinessStatus
    archivedAt: string | null
    /** Data prevista da exclusão definitiva automática (arquivados). */
    purgeAt: string | null
    interviewId: string | null
    version: number
    createdAt: string
    updatedAt: string
}

export interface BusinessDetailDto extends BusinessDto {
    goals: BusinessGoalDto[]
    /** O usuário pode editar (dono); suporte é somente leitura. */
    editable: boolean
}

/** Vagas do dono (limite do perfil de acesso; `null` = ilimitado). */
export interface BusinessCapacityDto {
    limit: number | null
    active: number
    archived: number
    canCreate: boolean
}

export interface BusinessListDto {
    items: BusinessDto[]
    capacity: BusinessCapacityDto
}

/** Situação do onboarding obrigatório (em `/api/me`). */
export interface OnboardingDto {
    required: boolean
    interviewId: string | null
    archived: number
}

// ── Entrevista ─────────────────────────────────────────────────────────────

export type InterviewStatus = "in_progress" | "completed"
export type InterviewAnswerStatus = "pending" | "answered" | "skipped"

export interface InterviewQuestionProgressDto extends InterviewQuestionDef {
    status: InterviewAnswerStatus
    /** Valor coletado, já formatado para exibição. */
    display: string | null
    current: boolean
}

export interface InterviewProgressDto {
    id: string
    status: InterviewStatus
    scriptVersion: number
    questions: InterviewQuestionProgressDto[]
    subtype: string | null
    businessId: string | null
    /** Descartar só com outro negócio ativo. */
    canDiscard: boolean
    /** Pergunta atual pede imagem (logo/foto): o chat libera o anexo. */
    acceptsImage: boolean
    startedAt: string
    completedAt: string | null
}

export interface InterviewStatusDto {
    available: boolean
    reason: string | null
    /** Tamanho máximo da imagem (limite de documentos da Plataforma). */
    maxImageMb: number
}

export interface InterviewTranscriptDto {
    interview: InterviewProgressDto
    messages: { role: "user" | "assistant"; text: string; files: { name: string }[]; createdAt: string }[]
}

// ── Configuração ───────────────────────────────────────────────────────────

export interface InterviewScriptVersionDto {
    version: number
    notes: string
    createdBy: string | null
    createdByName: string | null
    createdAt: string | null
    questions: InterviewQuestionDef[]
}

export interface InterviewerSettingsDto {
    settings: InterviewerSettings
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
    script: InterviewScriptVersionDto
    history: Omit<InterviewScriptVersionDto, "questions">[]
    /** Última vez em que alguém ficou bloqueado pela IA indisponível (aviso na tela). */
    lastUnavailableAt: string | null
    lastUnavailableReason: string | null
}

export type { BusinessField }
