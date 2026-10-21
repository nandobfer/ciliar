import mongoose, { Schema, type Connection } from "mongoose"
import type { EncryptedSecret } from "@/lib/crypto/secretBox"
import type { OrderAiStatus, OrderDecider, OrderStatus, OrderVersionReason, WorkFixedColumn } from "../constants"
import type { OrderSnapshot } from "../logic"

/**
 * Coleções de Clientes, Pedidos e do registro mínimo de Trabalhos (M3), no banco `ciliar`. Ver
 * `aicontext/modules/orders.md`. Índices pela migração `ensure-business-indexes`.
 */

export interface ClientRecord {
    /** Clientes pertencem ao usuário (dono efetivo), não ao negócio. */
    ownerId: string
    name: string
    email: string | null
    phone: string | null
    /** Privado (nunca no link do orçamento). */
    notes: string | null
    status: "active" | "archived"
    archivedAt: Date | null
    version: number
    createdBy: string
    updatedBy: string
    createdAt: Date
    updatedAt: Date
}

const clientSchema = new Schema<ClientRecord>(
    {
        ownerId: { type: String, required: true },
        name: { type: String, required: true },
        email: { type: String, default: null },
        phone: { type: String, default: null },
        notes: { type: String, default: null },
        status: { type: String, enum: ["active", "archived"], default: "active" },
        archivedAt: { type: Date, default: null },
        version: { type: Number, default: 0 },
        createdBy: { type: String, required: true },
        updatedBy: { type: String, required: true },
    },
    { collection: "business_clients", timestamps: true, versionKey: false },
)
clientSchema.index({ ownerId: 1, status: 1, name: 1 })
clientSchema.index({ status: 1, archivedAt: 1 })

export interface OrderItemRecord {
    id: string
    activityId: string
    activityName: string
    minutes: number
    /** Valor/hora congelado na inclusão do item. */
    hourlyRateCents: number
}

export interface OrderAttachmentRecord {
    id: string
    name: string
    mediaType: string
    size: number
    clientVisible: boolean
}

export interface OrderLinkRecord {
    /** Token cifrado (AES-256-GCM) para "Copiar link" enquanto válido. */
    tokenBox: EncryptedSecret
    /** SHA-256 do token: busca da rota pública. */
    tokenHash: string
    /** `AAAA-MM-DD`, inclusive, no fuso de quem enviou. */
    validUntil: string
    timeZone: string
    sentAt: Date
    emailedAt: Date | null
}

export interface OrderDecisionRecord {
    kind: "accept" | "reject"
    by: OrderDecider
    /** Ator real (prestador) ou `null` (cliente pelo link). */
    actorId: string | null
    name: string | null
    reason: string | null
    ip: string | null
    at: Date
    versionNumber: number | null
    /** Cópia imutável da versão decidida. */
    snapshot: OrderSnapshot
}

export interface OrderRecord {
    businessId: string
    ownerId: string
    clientId: string
    number: number
    code: string
    currency: string
    description: string
    title: string | null
    summary: string | null
    titleManual: boolean
    summaryManual: boolean
    aiStatus: OrderAiStatus
    aiError: string | null
    /** Hash da descrição que gerou a saída da IA (não sobrescreve uma descrição mais recente). */
    aiSourceHash: string | null
    items: OrderItemRecord[]
    totalOverrideCents: number | null
    dueDate: string | null
    attachments: OrderAttachmentRecord[]
    status: OrderStatus
    link: OrderLinkRecord | null
    firstSentAt: Date | null
    /** Número da última versão gravada (0 = nenhuma). */
    versionCount: number
    decisions: OrderDecisionRecord[]
    cancelledAt: Date | null
    workId: string | null
    version: number
    createdBy: string
    updatedBy: string
    createdAt: Date
    updatedAt: Date
}

const itemSchema = new Schema<OrderItemRecord>({ id: String, activityId: String, activityName: String, minutes: Number, hourlyRateCents: Number }, { _id: false })
const attachmentSchema = new Schema<OrderAttachmentRecord>({ id: String, name: String, mediaType: String, size: Number, clientVisible: { type: Boolean, default: true } }, { _id: false })
const linkSchema = new Schema<OrderLinkRecord>(
    { tokenBox: { type: Schema.Types.Mixed, required: true }, tokenHash: { type: String, required: true }, validUntil: String, timeZone: String, sentAt: Date, emailedAt: { type: Date, default: null } },
    { _id: false },
)
const decisionSchema = new Schema<OrderDecisionRecord>(
    { kind: String, by: String, actorId: { type: String, default: null }, name: { type: String, default: null }, reason: { type: String, default: null }, ip: { type: String, default: null }, at: Date, versionNumber: { type: Number, default: null }, snapshot: { type: Schema.Types.Mixed } },
    { _id: false },
)

const orderSchema = new Schema<OrderRecord>(
    {
        businessId: { type: String, required: true },
        ownerId: { type: String, required: true },
        clientId: { type: String, required: true },
        number: { type: Number, required: true },
        code: { type: String, required: true },
        currency: { type: String, required: true },
        description: { type: String, required: true },
        title: { type: String, default: null },
        summary: { type: String, default: null },
        titleManual: { type: Boolean, default: false },
        summaryManual: { type: Boolean, default: false },
        aiStatus: { type: String, enum: ["idle", "pending", "done", "error"], default: "idle" },
        aiError: { type: String, default: null },
        aiSourceHash: { type: String, default: null },
        items: { type: [itemSchema], default: [] },
        totalOverrideCents: { type: Number, default: null },
        dueDate: { type: String, default: null },
        attachments: { type: [attachmentSchema], default: [] },
        status: { type: String, enum: ["draft", "sent", "accepted", "rejected", "cancelled"], default: "draft" },
        link: { type: linkSchema, default: null },
        firstSentAt: { type: Date, default: null },
        versionCount: { type: Number, default: 0 },
        decisions: { type: [decisionSchema], default: [] },
        cancelledAt: { type: Date, default: null },
        workId: { type: String, default: null },
        version: { type: Number, default: 0 },
        createdBy: { type: String, required: true },
        updatedBy: { type: String, required: true },
    },
    { collection: "business_orders", timestamps: true, versionKey: false },
)
orderSchema.index({ businessId: 1, number: 1 }, { unique: true })
orderSchema.index({ ownerId: 1, status: 1, createdAt: -1 })
orderSchema.index({ clientId: 1 })
orderSchema.index({ "link.tokenHash": 1 }, { unique: true, partialFilterExpression: { "link.tokenHash": { $type: "string" } } })

/** Versão imutável do pedido (o que o cliente vê). */
export interface OrderVersionRecord {
    orderId: string
    businessId: string
    number: number
    reason: OrderVersionReason
    /** Publicada no link (enviada ou alterada com o link ativo); rascunhos depois do 1º envio não. */
    published: boolean
    snapshot: OrderSnapshot
    actorId: string
    simulation: unknown
    createdAt: Date
}
const orderVersionSchema = new Schema<OrderVersionRecord>(
    {
        orderId: { type: String, required: true, immutable: true },
        businessId: { type: String, required: true, immutable: true },
        number: { type: Number, required: true, immutable: true },
        reason: { type: String, enum: ["send", "edit", "reopen"], required: true, immutable: true },
        published: { type: Boolean, default: false },
        snapshot: { type: Schema.Types.Mixed, required: true, immutable: true },
        actorId: { type: String, required: true, immutable: true },
        simulation: { type: Schema.Types.Mixed, default: null, immutable: true },
    },
    { collection: "business_order_versions", timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
)
orderVersionSchema.index({ orderId: 1, number: 1 }, { unique: true })
orderVersionSchema.index({ businessId: 1 })

/** Registro mínimo do Trabalho (M4 constrói o Kanban por cima). */
export interface WorkRecord {
    businessId: string
    ownerId: string
    orderId: string
    clientId: string
    code: string
    column: WorkFixedColumn
    estimatedMinutes: number
    totalCents: number
    currency: string
    dueDate: string | null
    status: "active" | "archived"
    archivedAt: Date | null
    version: number
    createdBy: string
    createdAt: Date
    updatedAt: Date
}
const workSchema = new Schema<WorkRecord>(
    {
        businessId: { type: String, required: true },
        ownerId: { type: String, required: true },
        orderId: { type: String, required: true },
        clientId: { type: String, required: true },
        code: { type: String, required: true },
        column: { type: String, default: "opening" },
        estimatedMinutes: { type: Number, default: 0 },
        totalCents: { type: Number, default: 0 },
        currency: { type: String, required: true },
        dueDate: { type: String, default: null },
        status: { type: String, enum: ["active", "archived"], default: "active" },
        archivedAt: { type: Date, default: null },
        version: { type: Number, default: 0 },
        createdBy: { type: String, required: true },
    },
    { collection: "business_works", timestamps: true, versionKey: false },
)
workSchema.index({ orderId: 1 }, { unique: true })
workSchema.index({ businessId: 1, status: 1, column: 1 })

function modelOf<T>(connection: Connection, name: string, schema: Schema<T>): mongoose.Model<T> {
    return (connection.models[name] as mongoose.Model<T>) || connection.model<T>(name, schema)
}

export function orderModels(connection: Connection = mongoose.connection) {
    return {
        clients: modelOf(connection, "BusinessClient", clientSchema),
        orders: modelOf(connection, "BusinessOrder", orderSchema),
        orderVersions: modelOf(connection, "BusinessOrderVersion", orderVersionSchema),
        works: modelOf(connection, "BusinessWork", workSchema),
    }
}
