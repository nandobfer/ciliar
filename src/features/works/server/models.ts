import mongoose, { Schema, type Connection } from "mongoose"
import type { TimeEntrySource, WorkPaymentEvent } from "../constants"

/**
 * Coleções dos Trabalhos (M4), no banco `ciliar`. O trabalho nasce do aceite do pedido (M3) na coluna
 * Abertura. Índices pela migração `ensure-business-indexes` (sem `dbConnect` na migração). Ver
 * `aicontext/modules/works.md`.
 */

export interface WorkPaymentRecord {
    /** `AAAA-MM-DD`: a data usada no faturamento das metas. */
    paidOn: string
    receivedCents: number
    method: string | null
    at: Date
    by: string
}

export interface WorkPaymentEventRecord {
    kind: WorkPaymentEvent
    paidOn: string | null
    receivedCents: number | null
    method: string | null
    at: Date
    actorId: string
}

export interface WorkFileRef {
    id: string
    name: string
    mediaType: string
    size: number
}

export interface WorkRecord {
    businessId: string
    ownerId: string
    orderId: string
    clientId: string
    code: string
    /** Coluna fixa (`opening`, `execution`, `validation`, `paid`) ou customizada (`col-…`). */
    column: string
    /** Posição manual na coluna (ponto médio entre os vizinhos ao soltar). */
    position: number
    /** Cópia do pedido para o quadro (o pedido aceito é a fonte de itens, valor e prazo). */
    estimatedMinutes: number
    totalCents: number
    currency: string
    dueDate: string | null
    /** Soma dos lançamentos de horas (atualizada na transação de cada lançamento). */
    loggedMinutes: number
    /** Pagamento atual (só em Pago). */
    payment: WorkPaymentRecord | null
    /** Histórico do pagamento: registrado, corrigido e estornado (sair de Pago). */
    payments: WorkPaymentEventRecord[]
    /** Anexos próprios (entregáveis), arquivos `purpose: "work"` do espaço. */
    attachments: WorkFileRef[]
    /** Sucesso criado por "Converter em Sucesso" (um por trabalho). */
    successId: string | null
    status: "active" | "archived"
    archivedAt: Date | null
    version: number
    createdBy: string
    updatedBy: string | null
    createdAt: Date
    updatedAt: Date
}

const paymentSchema = new Schema<WorkPaymentRecord>({ paidOn: String, receivedCents: Number, method: { type: String, default: null }, at: Date, by: String }, { _id: false })
const paymentEventSchema = new Schema<WorkPaymentEventRecord>(
    { kind: { type: String, enum: ["marked", "edited", "unmarked"] }, paidOn: { type: String, default: null }, receivedCents: { type: Number, default: null }, method: { type: String, default: null }, at: Date, actorId: String },
    { _id: false },
)
const fileRefSchema = new Schema<WorkFileRef>({ id: String, name: String, mediaType: String, size: Number }, { _id: false })

const workSchema = new Schema<WorkRecord>(
    {
        businessId: { type: String, required: true },
        ownerId: { type: String, required: true },
        orderId: { type: String, required: true },
        clientId: { type: String, required: true },
        code: { type: String, required: true },
        column: { type: String, default: "opening" },
        position: { type: Number, default: 0 },
        estimatedMinutes: { type: Number, default: 0 },
        totalCents: { type: Number, default: 0 },
        currency: { type: String, required: true },
        dueDate: { type: String, default: null },
        loggedMinutes: { type: Number, default: 0 },
        payment: { type: paymentSchema, default: null },
        payments: { type: [paymentEventSchema], default: [] },
        attachments: { type: [fileRefSchema], default: [] },
        successId: { type: String, default: null },
        status: { type: String, enum: ["active", "archived"], default: "active" },
        archivedAt: { type: Date, default: null },
        version: { type: Number, default: 0 },
        createdBy: { type: String, required: true },
        updatedBy: { type: String, default: null },
    },
    { collection: "business_works", timestamps: true, versionKey: false },
)
workSchema.index({ orderId: 1 }, { unique: true })
workSchema.index({ businessId: 1, status: 1, column: 1 })
workSchema.index({ ownerId: 1, status: 1 })
workSchema.index({ businessId: 1, column: 1, "payment.paidOn": 1 })
workSchema.index({ status: 1, archivedAt: 1 })

/** Coluna customizada do negócio (as fixas não são gravadas). */
export interface WorkColumnRecord {
    businessId: string
    ownerId: string
    key: string
    name: string
    color: string
    icon: string
    description: string | null
    createdBy: string
    createdAt: Date
    updatedAt: Date
}
const workColumnSchema = new Schema<WorkColumnRecord>(
    {
        businessId: { type: String, required: true },
        ownerId: { type: String, required: true },
        key: { type: String, required: true },
        name: { type: String, required: true },
        color: { type: String, required: true },
        icon: { type: String, required: true },
        description: { type: String, default: null },
        createdBy: { type: String, required: true },
    },
    { collection: "business_work_columns", timestamps: true, versionKey: false },
)
workColumnSchema.index({ businessId: 1, key: 1 }, { unique: true })

/** Ordem das colunas do quadro do negócio (fixas + customizadas). */
export interface WorkBoardLayoutRecord {
    businessId: string
    order: string[]
    updatedAt: Date
}
const workBoardLayoutSchema = new Schema<WorkBoardLayoutRecord>(
    { businessId: { type: String, required: true }, order: { type: [String], default: [] } },
    { collection: "business_work_layouts", timestamps: { createdAt: false, updatedAt: true }, versionKey: false },
)
workBoardLayoutSchema.index({ businessId: 1 }, { unique: true })

/** Movimentação entre colunas (origem/destino, data e ator). */
export interface WorkMoveRecord {
    workId: string
    businessId: string
    from: string | null
    to: string
    actorId: string
    simulation: unknown
    createdAt: Date
}
const workMoveSchema = new Schema<WorkMoveRecord>(
    {
        workId: { type: String, required: true, immutable: true },
        businessId: { type: String, required: true, immutable: true },
        from: { type: String, default: null, immutable: true },
        to: { type: String, required: true, immutable: true },
        actorId: { type: String, required: true, immutable: true },
        simulation: { type: Schema.Types.Mixed, default: null, immutable: true },
    },
    { collection: "business_work_moves", timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
)
workMoveSchema.index({ workId: 1, createdAt: 1 })
workMoveSchema.index({ businessId: 1 })

/** Nota/comentário interno (só o autor edita/exclui). */
export interface WorkNoteRecord {
    workId: string
    businessId: string
    authorId: string
    content: string
    editedAt: Date | null
    createdAt: Date
}
const workNoteSchema = new Schema<WorkNoteRecord>(
    {
        workId: { type: String, required: true },
        businessId: { type: String, required: true },
        authorId: { type: String, required: true },
        content: { type: String, required: true },
        editedAt: { type: Date, default: null },
    },
    { collection: "business_work_notes", timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
)
workNoteSchema.index({ workId: 1, createdAt: -1 })
workNoteSchema.index({ businessId: 1 })

/** Lançamento manual de horas (sem cronômetro), com o valor/hora congelado. */
export interface TimeEntryRecord {
    workId: string
    businessId: string
    ownerId: string
    source: TimeEntrySource
    /** Id do item do pedido ou da atividade do negócio. */
    refId: string
    name: string
    hourlyRateCents: number
    /** `AAAA-MM-DD`: dia trabalhado. */
    date: string
    minutes: number
    description: string | null
    authorId: string
    version: number
    createdAt: Date
    updatedAt: Date
}
const timeEntrySchema = new Schema<TimeEntryRecord>(
    {
        workId: { type: String, required: true },
        businessId: { type: String, required: true },
        ownerId: { type: String, required: true },
        source: { type: String, enum: ["orderItem", "activity"], required: true },
        refId: { type: String, required: true },
        name: { type: String, required: true },
        hourlyRateCents: { type: Number, required: true },
        date: { type: String, required: true },
        minutes: { type: Number, required: true },
        description: { type: String, default: null },
        authorId: { type: String, required: true },
        version: { type: Number, default: 0 },
    },
    { collection: "business_work_time_entries", timestamps: true, versionKey: false },
)
timeEntrySchema.index({ workId: 1, date: -1 })
timeEntrySchema.index({ businessId: 1 })

function modelOf<T>(connection: Connection, name: string, schema: Schema<T>): mongoose.Model<T> {
    return (connection.models[name] as mongoose.Model<T>) || connection.model<T>(name, schema)
}

export function workModels(connection: Connection = mongoose.connection) {
    return {
        works: modelOf(connection, "BusinessWork", workSchema),
        columns: modelOf(connection, "BusinessWorkColumn", workColumnSchema),
        layouts: modelOf(connection, "BusinessWorkLayout", workBoardLayoutSchema),
        moves: modelOf(connection, "BusinessWorkMove", workMoveSchema),
        notes: modelOf(connection, "BusinessWorkNote", workNoteSchema),
        timeEntries: modelOf(connection, "BusinessWorkTimeEntry", timeEntrySchema),
    }
}
