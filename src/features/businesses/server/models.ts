import mongoose, { Schema, type Connection, type Types } from "mongoose"
import type { OpexMessageStatus, OpexPart, OpexUsageDto } from "@/features/opex-agent/types"
import type { BusinessField, BusinessFilePurpose, BusinessStatus, BusinessThemeMode, BusinessType, Currency, GoalMeasure, GoalMode, GoalPeriod, GoalStatus, GoalSupersedeReason, InterviewQuestionDef } from "../constants"
import type { InterviewStatus } from "../types"

/**
 * Coleções dos Negócios e do Agente Entrevistador (M1), no banco `ciliar`. Ver
 * `aicontext/modules/businesses.md`. Índices pela migração `ensure-business-indexes`.
 */

export interface BusinessLogo { key: string; name: string; mediaType: string; size: number }
export interface AvailabilityDay { weekday: number; start: string | null; end: string | null }
export interface BusinessTheme { primaryColor: string; mode: BusinessThemeMode }

export interface BusinessRecord {
    /** Dono (um único usuário por negócio). */
    ownerId: string
    /** Sequencial por dono ("Negócio N"). */
    number: number
    name: string
    type: BusinessType | null
    subtype: string | null
    segment: string | null
    description: string | null
    logo: BusinessLogo | null
    links: string[]
    availability: AvailabilityDay[]
    currency: Currency
    /** Tema do espaço, portfólio, link do orçamento e e-mails do negócio (M2). */
    theme: BusinessTheme
    /** Contato comercial (M2/M3). `contactEmail` vazio = e-mail da conta do dono. */
    contactEmail: string | null
    contactPhone: string | null
    /** Antecedência do alerta de prazo (M3), em dias. */
    deadlineAlertDays: number
    /** Validade padrão do link do orçamento (M3), em dias. */
    quoteValidityDays: number
    /** Contador do código dos pedidos (`PED-0001`, M3), incrementado na transação. */
    orderSeq: number
    status: BusinessStatus
    archivedAt: Date | null
    interviewId: string | null
    version: number
    createdBy: string
    updatedBy: string
    createdAt: Date
    updatedAt: Date
}

const themeSchema = new Schema<BusinessTheme>({ primaryColor: { type: String, default: "#0B57C4" }, mode: { type: String, enum: ["dark", "light"], default: "light" } }, { _id: false })
const logoSchema = new Schema<BusinessLogo>({ key: String, name: String, mediaType: String, size: Number }, { _id: false })
const availabilitySchema = new Schema<AvailabilityDay>({ weekday: Number, start: { type: String, default: null }, end: { type: String, default: null } }, { _id: false })

const businessSchema = new Schema<BusinessRecord>(
    {
        ownerId: { type: String, required: true },
        number: { type: Number, required: true },
        name: { type: String, required: true },
        type: { type: String, enum: ["PF", "PJ"], default: null },
        subtype: { type: String, default: null },
        segment: { type: String, default: null },
        description: { type: String, default: null },
        logo: { type: logoSchema, default: null },
        links: { type: [String], default: [] },
        availability: { type: [availabilitySchema], default: [] },
        currency: { type: String, default: "BRL" },
        theme: { type: themeSchema, default: () => ({ primaryColor: "#0B57C4", mode: "light" }) },
        contactEmail: { type: String, default: null },
        contactPhone: { type: String, default: null },
        deadlineAlertDays: { type: Number, default: 3 },
        quoteValidityDays: { type: Number, default: 15 },
        orderSeq: { type: Number, default: 0 },
        status: { type: String, enum: ["active", "archived"], default: "active" },
        archivedAt: { type: Date, default: null },
        interviewId: { type: String, default: null },
        version: { type: Number, default: 0 },
        createdBy: { type: String, required: true },
        updatedBy: { type: String, required: true },
    },
    { collection: "businesses", timestamps: true, versionKey: false },
)
businessSchema.index({ ownerId: 1, status: 1, createdAt: 1 })
businessSchema.index({ status: 1, archivedAt: 1 })

export interface BusinessGoalRecord {
    businessId: string
    ownerId: string
    name: string | null
    targetCents: number
    period: GoalPeriod
    measure: GoalMeasure | null
    mode: GoalMode | null
    month: string | null
    year: number | null
    from: string | null
    to: string | null
    status: GoalStatus
    archivedAt: Date | null
    /** Períodos em que a meta foi a ativa (`to: null` = ativa agora). */
    activePeriods: GoalActivePeriod[]
    supersededAt: Date | null
    supersededBy: string | null
    supersededReason: GoalSupersedeReason | null
    version: number
    createdBy: string
    updatedBy: string | null
    createdAt: Date
    updatedAt: Date
}

export interface GoalActivePeriod {
    from: Date
    to: Date | null
}

const goalSchema = new Schema<BusinessGoalRecord>(
    {
        businessId: { type: String, required: true },
        ownerId: { type: String, required: true },
        name: { type: String, default: null },
        targetCents: { type: Number, required: true },
        period: { type: String, enum: ["hour", "month", "year"], required: true },
        measure: { type: String, default: null },
        mode: { type: String, default: null },
        month: { type: String, default: null },
        year: { type: Number, default: null },
        from: { type: String, default: null },
        to: { type: String, default: null },
        status: { type: String, enum: ["active", "superseded", "archived"], default: "active" },
        archivedAt: { type: Date, default: null },
        activePeriods: { type: [{ _id: false, from: { type: Date, required: true }, to: { type: Date, default: null } }], default: [] },
        supersededAt: { type: Date, default: null },
        supersededBy: { type: String, default: null },
        supersededReason: { type: String, enum: ["new", "edit", "restore"], default: null },
        version: { type: Number, default: 0 },
        createdBy: { type: String, required: true },
        updatedBy: { type: String, default: null },
    },
    { collection: "business_goals", timestamps: true, versionKey: false },
)
goalSchema.index({ businessId: 1, status: 1 })
// O índice único "uma meta ativa por negócio" NÃO fica no schema (o autoIndex falharia com dados antigos):
// `ensureGoalIndexes` (migração de boot) normaliza os dados e só então o cria.
goalSchema.index({ status: 1, archivedAt: 1 })

// ── Espaço do negócio (M2) ──────────────────────────────────────────────────────

/** Campos comuns dos itens do espaço (arquivamento como o do negócio + versão otimista). */
interface ItemBase {
    businessId: string
    ownerId: string
    status: BusinessStatus
    archivedAt: Date | null
    version: number
    createdBy: string
    updatedBy: string
    createdAt: Date
    updatedAt: Date
}
const itemBase = {
    businessId: { type: String, required: true },
    ownerId: { type: String, required: true },
    status: { type: String, enum: ["active", "archived"], default: "active" as BusinessStatus },
    archivedAt: { type: Date, default: null },
    version: { type: Number, default: 0 },
    createdBy: { type: String, required: true },
    updatedBy: { type: String, required: true },
}

export interface BusinessActivityRecord extends ItemBase {
    name: string
    description: string | null
    category: string | null
    /** Valor por hora em unidades mínimas da moeda do negócio. */
    hourlyRateCents: number
    /** Inativa não aparece em novos pedidos (M3); mantém o histórico. */
    active: boolean
}
const activitySchema = new Schema<BusinessActivityRecord>(
    {
        ...itemBase,
        name: { type: String, required: true },
        description: { type: String, default: null },
        category: { type: String, default: null },
        hourlyRateCents: { type: Number, required: true },
        active: { type: Boolean, default: true },
    },
    { collection: "business_activities", timestamps: true, versionKey: false },
)
activitySchema.index({ businessId: 1, status: 1, name: 1 })
activitySchema.index({ status: 1, archivedAt: 1 })

/** Histórico do valor/hora (anterior, novo, data e ator real). `fromCents: null` = criação. */
export interface ActivityPriceRecord {
    activityId: string
    businessId: string
    fromCents: number | null
    toCents: number
    actorId: string
    simulation: unknown
    createdAt: Date
}
const activityPriceSchema = new Schema<ActivityPriceRecord>(
    {
        activityId: { type: String, required: true },
        businessId: { type: String, required: true },
        fromCents: { type: Number, default: null },
        toCents: { type: Number, required: true },
        actorId: { type: String, required: true },
        simulation: { type: Schema.Types.Mixed, default: null },
    },
    { collection: "business_activity_prices", timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
)
activityPriceSchema.index({ activityId: 1, createdAt: -1 })
activityPriceSchema.index({ businessId: 1 })

/** Referência a um arquivo do espaço (`business_files`). */
export interface BusinessFileRef { id: string; name: string; mediaType: string; size: number }
const fileRefSchema = new Schema<BusinessFileRef>({ id: String, name: String, mediaType: String, size: Number }, { _id: false })

export interface BusinessDocumentRecord extends ItemBase {
    name: string
    category: string | null
    description: string | null
    /** Publicável no Portfólio (M5). */
    portfolio: boolean
    file: BusinessFileRef
}
const documentSchema = new Schema<BusinessDocumentRecord>(
    {
        ...itemBase,
        name: { type: String, required: true },
        category: { type: String, default: null },
        description: { type: String, default: null },
        portfolio: { type: Boolean, default: false },
        file: { type: fileRefSchema, required: true },
    },
    { collection: "business_documents", timestamps: true, versionKey: false },
)
documentSchema.index({ businessId: 1, status: 1, createdAt: -1 })
documentSchema.index({ status: 1, archivedAt: 1 })

export interface BusinessSuccessRecord extends ItemBase {
    title: string
    description: string | null
    /** `AAAA-MM-DD`. */
    date: string | null
    result: string | null
    attachments: BusinessFileRef[]
    /** Vínculos que entram com o M3 (cliente) e o M4 (trabalho). */
    clientId: string | null
    workId: string | null
}
const successSchema = new Schema<BusinessSuccessRecord>(
    {
        ...itemBase,
        title: { type: String, required: true },
        description: { type: String, default: null },
        date: { type: String, default: null },
        result: { type: String, default: null },
        attachments: { type: [fileRefSchema], default: [] },
        clientId: { type: String, default: null },
        workId: { type: String, default: null },
    },
    { collection: "business_successes", timestamps: true, versionKey: false },
)
successSchema.index({ businessId: 1, status: 1, createdAt: -1 })
successSchema.index({ status: 1, archivedAt: 1 })

/**
 * Arquivo do espaço (documento, anexo de sucesso ou logo): só metadados; o binário fica no Storage S3.
 * Reserva com PUT assinado (`uploadKey`), confirmação e cópia para `key`; `pending` até ser usado.
 */
export interface BusinessFileRecord {
    businessId: string
    ownerId: string
    purpose: BusinessFilePurpose
    pending: boolean
    ready: boolean
    /** Item que usa o arquivo (documento, sucesso ou pedido). */
    itemId: string | null
    name: string
    mediaType: string
    size: number
    key: string
    uploadKey: string
    createdBy: string
    createdAt: Date
}
const businessFileSchema = new Schema<BusinessFileRecord>(
    {
        businessId: { type: String, required: true },
        ownerId: { type: String, required: true },
        purpose: { type: String, enum: ["document", "success", "logo", "order", "work", "portfolio", "media"], required: true },
        pending: { type: Boolean, default: true },
        ready: { type: Boolean, default: false },
        itemId: { type: String, default: null },
        name: { type: String, required: true },
        mediaType: { type: String, required: true },
        size: { type: Number, required: true },
        key: { type: String, required: true },
        uploadKey: { type: String, required: true },
        createdBy: { type: String, required: true },
    },
    { collection: "business_files", timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
)
businessFileSchema.index({ businessId: 1, itemId: 1 })
businessFileSchema.index({ pending: 1, createdAt: 1 })

// ── Portfólio (M5) ────────────────────────────────────────────────────────────────────────────

/** Blocos do editor (validados por `portfolioBlocksSchema` em `portfolio/blocks.ts`; guardados como dados livres). */
export type StoredPortfolioBlock = Record<string, unknown>

/**
 * Portfólio público do negócio (um por negócio). O estado de publicação é independente do status
 * do negócio: arquivado responde 404 e, ao restaurar, volta como estava. A página é uma lista de
 * blocos: o rascunho (salvo sozinho pelo editor) e o publicado (`live`), trocado em "Publicar
 * alterações". `version` cobre a configuração/publicação; `draft.version`, o rascunho.
 */
export interface BusinessPortfolioRecord {
    businessId: string
    ownerId: string
    /** Único em toda a plataforma (`/p/[slug]`). */
    slug: string
    published: boolean
    publishedAt: Date | null
    /** Indexação pelos buscadores (`noindex` por padrão). */
    indexable: boolean
    draft: { blocks: StoredPortfolioBlock[]; version: number; updatedAt: Date | null; updatedBy: string | null }
    live: { blocks: StoredPortfolioBlock[]; number: number; publishedAt: Date | null; publishedBy: string | null }
    /** O modelo inicial já foi escolhido (ou o rascunho já foi editado). */
    started: boolean
    version: number
    createdBy: string
    updatedBy: string
    createdAt: Date
    updatedAt: Date
}
const portfolioSchema = new Schema<BusinessPortfolioRecord>(
    {
        businessId: { type: String, required: true },
        ownerId: { type: String, required: true },
        slug: { type: String, required: true },
        published: { type: Boolean, default: false },
        publishedAt: { type: Date, default: null },
        indexable: { type: Boolean, default: false },
        draft: {
            type: new Schema({ blocks: { type: [Schema.Types.Mixed], default: [] }, version: { type: Number, default: 0 }, updatedAt: { type: Date, default: null }, updatedBy: { type: String, default: null } }, { _id: false, minimize: false }),
            default: () => ({ blocks: [], version: 0, updatedAt: null, updatedBy: null }),
        },
        live: {
            type: new Schema({ blocks: { type: [Schema.Types.Mixed], default: [] }, number: { type: Number, default: 0 }, publishedAt: { type: Date, default: null }, publishedBy: { type: String, default: null } }, { _id: false, minimize: false }),
            default: () => ({ blocks: [], number: 0, publishedAt: null, publishedBy: null }),
        },
        started: { type: Boolean, default: false },
        version: { type: Number, default: 0 },
        createdBy: { type: String, required: true },
        updatedBy: { type: String, required: true },
    },
    { collection: "business_portfolios", timestamps: true, versionKey: false, minimize: false },
)
portfolioSchema.index({ businessId: 1 }, { unique: true })
portfolioSchema.index({ slug: 1 }, { unique: true })

/** Histórico das publicações (as últimas `PORTFOLIO_PUBLICATIONS_KEEP`), para restaurar como rascunho. */
export interface BusinessPortfolioPublicationRecord {
    businessId: string
    ownerId: string
    number: number
    blocks: StoredPortfolioBlock[]
    publishedAt: Date
    publishedBy: string
}
const portfolioPublicationSchema = new Schema<BusinessPortfolioPublicationRecord>(
    {
        businessId: { type: String, required: true },
        ownerId: { type: String, required: true },
        number: { type: Number, required: true },
        blocks: { type: Schema.Types.Mixed, default: () => [] },
        publishedAt: { type: Date, required: true },
        publishedBy: { type: String, required: true },
    },
    { collection: "business_portfolio_publications", versionKey: false, minimize: false },
)
portfolioPublicationSchema.index({ businessId: 1, number: -1 }, { unique: true })

/** Item avulso do portfólio: projeto só para o portfólio, com galeria de imagens. */
export interface BusinessPortfolioItemRecord extends ItemBase {
    title: string
    description: string | null
    images: BusinessFileRef[]
    url: string | null
    /** `AAAA-MM-DD`. */
    date: string | null
    tags: string[]
}
const portfolioItemSchema = new Schema<BusinessPortfolioItemRecord>(
    {
        ...itemBase,
        title: { type: String, required: true },
        description: { type: String, default: null },
        images: { type: [fileRefSchema], default: [] },
        url: { type: String, default: null },
        date: { type: String, default: null },
        tags: { type: [String], default: [] },
    },
    { collection: "business_portfolio_items", timestamps: true, versionKey: false },
)
portfolioItemSchema.index({ businessId: 1, status: 1, createdAt: -1 })
portfolioItemSchema.index({ status: 1, archivedAt: 1 })

/** Estado por dono: fence das transações (limite de vagas) e o contador do "Negócio N". */
export interface BusinessOwnerStateRecord { _id: string; fence: number; seq: number }
const ownerStateSchema = new Schema<BusinessOwnerStateRecord>({ _id: String, fence: { type: Number, default: 0 }, seq: { type: Number, default: 0 } }, { collection: "business_owner_states", versionKey: false })

/** Versão imutável do roteiro (cada gravação cria uma). */
export interface InterviewScriptRecord {
    version: number
    questions: InterviewQuestionDef[]
    notes: string
    createdBy: string
    createdAt: Date
}
const questionSchema = new Schema<InterviewQuestionDef>({ field: String, prompt: String, required: Boolean, active: Boolean }, { _id: false })
const scriptSchema = new Schema<InterviewScriptRecord>(
    {
        version: { type: Number, required: true, immutable: true },
        questions: { type: [questionSchema], required: true, immutable: true },
        notes: { type: String, default: "", immutable: true },
        createdBy: { type: String, required: true, immutable: true },
    },
    { collection: "interview_scripts", timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
)
scriptSchema.index({ version: 1 }, { unique: true })

export interface InterviewAnswer {
    status: "answered" | "skipped"
    value: unknown
    updatedAt: Date
}

export type InterviewSessionStatus = "idle" | "running" | "error"

export interface InterviewRecord {
    /** Dono do negócio que nascerá (o alvo na simulação de usuário). */
    ownerId: string
    /** Ator real que iniciou (auditoria). */
    startedBy: string
    scriptVersion: number
    /** Cópia das perguntas da versão (a entrevista usa sempre a versão com que começou). */
    questions: InterviewQuestionDef[]
    answers: Partial<Record<BusinessField, InterviewAnswer>>
    subtype: string | null
    status: InterviewStatus
    businessId: string | null
    sessionStatus: InterviewSessionStatus
    lastError: string | null
    nextSeq: number
    messageCount: number
    lastMessageAt: Date
    completedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const interviewSchema = new Schema<InterviewRecord>(
    {
        ownerId: { type: String, required: true },
        startedBy: { type: String, required: true },
        scriptVersion: { type: Number, required: true },
        questions: { type: [questionSchema], default: [] },
        answers: { type: Schema.Types.Mixed, default: {} },
        subtype: { type: String, default: null },
        status: { type: String, enum: ["in_progress", "completed"], default: "in_progress" },
        businessId: { type: String, default: null },
        sessionStatus: { type: String, enum: ["idle", "running", "error"], default: "idle" },
        lastError: { type: String, default: null },
        nextSeq: { type: Number, default: 1 },
        messageCount: { type: Number, default: 0 },
        lastMessageAt: { type: Date, default: () => new Date() },
        completedAt: { type: Date, default: null },
    },
    { collection: "business_interviews", timestamps: true, versionKey: false, minimize: false },
)
// Uma entrevista em andamento por dono.
interviewSchema.index({ ownerId: 1 }, { unique: true, partialFilterExpression: { status: "in_progress" } })
interviewSchema.index({ businessId: 1 })

export interface InterviewFileRef { id: string; name: string; mediaType: string; size: number }

export interface InterviewMessageRecord {
    interviewId: Types.ObjectId
    seq: number
    role: "user" | "assistant"
    /** `system`: abertura automática da entrevista (não aparece na transcrição). */
    kind: "message" | "system"
    text: string
    files: InterviewFileRef[]
    parts: OpexPart[]
    /** `ModelMessage[]` em JSON (mesmo formato do Agente Opex). */
    modelMessages: string
    status: OpexMessageStatus
    error: string | null
    usage: OpexUsageDto | null
    durationMs: number | null
    model: string | null
    createdAt: Date
}

const interviewMessageSchema = new Schema<InterviewMessageRecord>(
    {
        interviewId: { type: Schema.Types.ObjectId, required: true },
        seq: { type: Number, required: true },
        role: { type: String, enum: ["user", "assistant"], required: true },
        kind: { type: String, enum: ["message", "system"], default: "message" },
        text: { type: String, default: "" },
        files: { type: Schema.Types.Mixed, default: [] },
        parts: { type: Schema.Types.Mixed, default: [] },
        modelMessages: { type: String, default: "[]" },
        status: { type: String, enum: ["complete", "interrupted", "error"], default: "complete" },
        error: { type: String, default: null },
        usage: { type: Schema.Types.Mixed, default: null },
        durationMs: { type: Number, default: null },
        model: { type: String, default: null },
    },
    { collection: "business_interview_messages", timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
)
interviewMessageSchema.index({ interviewId: 1, seq: 1 }, { unique: true })

/** Imagem enviada na entrevista (logo/foto): só metadados; o binário fica no Storage S3. */
export interface InterviewFileRecord {
    interviewId: Types.ObjectId
    messageId: Types.ObjectId | null
    pending: boolean
    ready: boolean
    name: string
    mediaType: string
    size: number
    key: string
    uploadKey: string
    createdAt: Date
}

const interviewFileSchema = new Schema<InterviewFileRecord>(
    {
        interviewId: { type: Schema.Types.ObjectId, required: true, index: true },
        messageId: { type: Schema.Types.ObjectId, default: null },
        pending: { type: Boolean, default: true },
        ready: { type: Boolean, default: false },
        name: { type: String, required: true },
        mediaType: { type: String, required: true },
        size: { type: Number, required: true },
        key: { type: String, required: true },
        uploadKey: { type: String, required: true },
    },
    { collection: "business_interview_files", timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
)
interviewFileSchema.index({ pending: 1, createdAt: 1 })

/** Singleton do alerta "IA indisponível" (limita o e-mail a 1 por hora e alimenta o aviso na tela). */
export interface InterviewerAlertRecord { _id: string; lastSentAt: Date | null; lastUnavailableAt: Date | null; lastReason: string | null }
const alertSchema = new Schema<InterviewerAlertRecord>(
    { _id: String, lastSentAt: { type: Date, default: null }, lastUnavailableAt: { type: Date, default: null }, lastReason: { type: String, default: null } },
    { collection: "interviewer_alerts", versionKey: false },
)

/**
 * Último acesso de um usuário (o ator REAL, inclusive na simulação) ao espaço de um negócio: ordena o
 * seletor do cabeçalho. Não é dado do negócio (sem versão nem auditoria); sai junto com o negócio.
 */
export interface BusinessAccessRecord {
    userId: string
    businessId: string
    accessedAt: Date
}

const accessSchema = new Schema<BusinessAccessRecord>(
    { userId: { type: String, required: true }, businessId: { type: String, required: true, index: true }, accessedAt: { type: Date, required: true } },
    { collection: "business_accesses", versionKey: false },
)
accessSchema.index({ userId: 1, businessId: 1 }, { unique: true })

function modelOf<T>(connection: Connection, name: string, schema: Schema<T>): mongoose.Model<T> {
    return (connection.models[name] as mongoose.Model<T>) || connection.model<T>(name, schema)
}

export function businessModels(connection: Connection = mongoose.connection) {
    return {
        businesses: modelOf(connection, "Business", businessSchema),
        goals: modelOf(connection, "BusinessGoal", goalSchema),
        activities: modelOf(connection, "BusinessActivity", activitySchema),
        activityPrices: modelOf(connection, "BusinessActivityPrice", activityPriceSchema),
        documents: modelOf(connection, "BusinessDocument", documentSchema),
        successes: modelOf(connection, "BusinessSuccess", successSchema),
        files: modelOf(connection, "BusinessFile", businessFileSchema),
        portfolios: modelOf(connection, "BusinessPortfolio", portfolioSchema),
        portfolioPublications: modelOf(connection, "BusinessPortfolioPublication", portfolioPublicationSchema),
        portfolioItems: modelOf(connection, "BusinessPortfolioItem", portfolioItemSchema),
        ownerStates: modelOf(connection, "BusinessOwnerState", ownerStateSchema),
        scripts: modelOf(connection, "InterviewScript", scriptSchema),
        interviews: modelOf(connection, "BusinessInterview", interviewSchema),
        interviewMessages: modelOf(connection, "BusinessInterviewMessage", interviewMessageSchema),
        interviewFiles: modelOf(connection, "BusinessInterviewFile", interviewFileSchema),
        alerts: modelOf(connection, "InterviewerAlert", alertSchema),
        accesses: modelOf(connection, "BusinessAccess", accessSchema),
    }
}
