import type { BusinessDashboardPeriod } from "./dashboard-period"
import type { AiFeatureAvailability } from "@/features/ai/types"
import type { BusinessField, BusinessFilePurpose, BusinessStatus, BusinessThemeMode, BusinessType, Currency, GoalMeasure, GoalMode, GoalPeriod, GoalStatus, GoalSupersedeReason, InterviewQuestionDef } from "./constants"
import type { GoalProgress } from "./goal-progress"
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
    theme: { primaryColor: string; mode: BusinessThemeMode }
    /** Contato comercial gravado (`null` = e-mail da conta do dono). */
    contactEmail: string | null
    contactPhone: string | null
    deadlineAlertDays: number
    quoteValidityDays: number
    status: BusinessStatus
    archivedAt: string | null
    /** Data prevista da exclusão definitiva automática (arquivados). */
    purgeAt: string | null
    interviewId: string | null
    version: number
    createdAt: string
    updatedAt: string
    /** Último acesso do usuário REAL ao espaço do negócio (`null` = nunca); só na listagem. */
    lastAccessedAt?: string | null
}

export interface BusinessDetailDto extends BusinessDto {
    goals: BusinessGoalDto[]
    /** O usuário pode editar (dono, negócio ativo); suporte é somente leitura. */
    editable: boolean
    /** Editar a ficha/logo/tema (`businesses.edit`), arquivar/restaurar e excluir definitivamente (`businesses.archive`/`businesses.delete`). */
    actions: { edit: boolean; archive: boolean; delete: boolean }
    /** É do dono efetivo (mesmo arquivado); `false` = leitura de suporte. */
    own: boolean
    /** E-mail da conta do dono (padrão do contato comercial). */
    accountEmail: string | null
    /** Moeda travada (já há pedidos/trabalhos, M3/M4). */
    currencyLocked: boolean
    /** Itens com valor na moeda atual, que não são convertidos ao trocar a moeda (aviso). */
    valuedItems: { activities: number; goals: number }
}

// ── Espaço do negócio (M2) ─────────────────────────────────────────────────────

interface ItemDtoBase {
    id: string
    businessId: string
    status: BusinessStatus
    archivedAt: string | null
    /** Data prevista da exclusão definitiva automática (arquivados; prazo do tipo na Plataforma). */
    purgeAt: string | null
    version: number
    createdAt: string
    updatedAt: string
}

export interface ActivityDto extends ItemDtoBase {
    name: string
    description: string | null
    category: string | null
    hourlyRateCents: number
    active: boolean
}

export interface ActivityPriceDto {
    fromCents: number | null
    toCents: number
    actorId: string
    actorName: string | null
    at: string
}

export interface ActivityDetailDto extends ActivityDto {
    priceHistory: ActivityPriceDto[]
}

export interface GoalItemDto extends BusinessGoalDto, Omit<ItemDtoBase, "status"> {
    /** `active` = a meta atual (uma por negócio); `superseded` = histórico, somente leitura. */
    status: GoalStatus
    /** Períodos em que foi a meta ativa (ISO; `to: null` = ativa agora). */
    activePeriods: { from: string; to: string | null }[]
    supersededAt: string | null
    supersededReason: GoalSupersedeReason | null
    /** Progresso: das metas fora de vigor, só as janelas até a última vez em que esteve ativa. */
    progress: GoalProgress
}

/** Metas do negócio: a atual e a linha do tempo (substituídas e arquivadas, mais recentes primeiro). */
export interface GoalsOverviewDto {
    current: GoalItemDto | null
    history: GoalItemDto[]
    editable: boolean
}

/** Resultado de arquivar a meta: a arquivada e a que voltou a valer (ou nenhuma). */
export interface GoalArchiveResultDto {
    archived: GoalItemDto
    current: GoalItemDto | null
}

export interface BusinessFileDto {
    id: string
    name: string
    mediaType: string
    size: number
    /** Rota do conteúdo (sem `basePath`). */
    url: string
}

export interface DocumentDto extends ItemDtoBase {
    name: string
    category: string | null
    description: string | null
    portfolio: boolean
    file: BusinessFileDto
}

export interface SuccessDto extends ItemDtoBase {
    title: string
    description: string | null
    date: string | null
    result: string | null
    attachments: BusinessFileDto[]
    clientId: string | null
    workId: string | null
}

export interface ItemListDto<T> {
    items: T[]
    /** Leitura de suporte (`businesses.view_all`) ou negócio arquivado: somente leitura. */
    editable: boolean
}

export interface BusinessFileReservationDto {
    id: string
    method: "PUT"
    url: string
    headers: Record<string, string>
    expiresIn: number
    purpose: BusinessFilePurpose
}

export interface DashboardCategorySlice {
    name: string
    count: number
}

export interface BusinessDashboardDto {
    businessId: string
    currency: Currency
    timeZone: string
    period: BusinessDashboardPeriod
    /** Pontos dos gráficos do período: por dia (mês atual) ou por mês. */
    granularity: "day" | "month"
    range: { from: string; to: string }
    /** A meta atual (uma por negócio), com o progresso da janela corrente. */
    goal: GoalItemDto | null
    /** Blocos que o perfil vê (visualização de cada módulo; `revenue` = Trabalhos). */
    visible: { activities: boolean; goals: boolean; documents: boolean; successes: boolean; revenue: boolean }
    counts: { activities: number; goals: number; documents: number; successes: number }
    kpis: {
        /** % atingido da meta atual na janela corrente (`null` = sem meta ou indisponível). */
        currentGoalPercent: number | null
        /** Faturamento bruto no período (zero até o M4). */
        revenueCents: number
        activeActivities: number
        averageRateCents: number | null
        documents: number
        successesInPeriod: number
    }
    charts: {
        activityRates: { name: string; rateCents: number }[]
        activitiesByCategory: DashboardCategorySlice[]
        documentsByCategory: DashboardCategorySlice[]
        successes: { bucket: string; count: number }[]
        /** Uma linha por atividade (`a0`…); valor `null` antes de a atividade existir. */
        rateTrend: { activities: { key: string; name: string }[]; rows: Record<string, string | number | null>[] }
        /** Faturamento bruto × a meta mensal que estava ativa em cada mês (linha do tempo). */
        revenue: { bucket: string; revenueCents: number; targetCents: number }[]
        hasRevenue: boolean
    }
}

/** Vagas do dono (limite do perfil de acesso; `null` = ilimitado). */
export interface BusinessCapacityDto {
    limit: number | null
    active: number
    archived: number
    /** Há vaga no limite de negócios ativos (criar e restaurar). */
    vacancy: boolean
    /** Vaga + `businesses.create`. */
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
    /**
     * Valor gravado (respondida), no formato do campo: texto, `PF`/`PJ`, lista de URLs, dias, metas, moeda
     * ou `{ fileId, name, mediaType, size }` da logo. Preenche o controle da correção na tela.
     */
    value: unknown
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
