import type { AiFeatureAvailability } from "@/features/ai/types"
import type { BusinessFileDto } from "@/features/businesses/types"
import type { OrderAction, OrderAiStatus, OrderDecider, OrderStatus, OrderVersionReason, WorkFixedColumn } from "./constants"
import type { OrderChange, OrderSnapshot } from "./logic"
import type { OrderTitleFeatureSettings } from "./schemas"

// ── Clientes ───────────────────────────────────────────────────────────────

export interface CurrencyTotalsDto {
    currency: string
    /** Pedidos aceitos. */
    acceptedCents: number
    /** Pedidos abertos (rascunho/enviado). */
    openCents: number
    orders: number
}

export interface ClientDto {
    id: string
    ownerId: string
    name: string
    email: string | null
    phone: string | null
    /** Privado: nunca aparece no link do orçamento. */
    notes: string | null
    status: "active" | "archived"
    archivedAt: string | null
    purgeAt: string | null
    version: number
    createdAt: string
    updatedAt: string
    /** Negócios em que o cliente tem pedidos (filtro por negócio). */
    businessIds: string[]
    orderCount: number
    totals: CurrencyTotalsDto[]
}

export interface ClientListDto {
    items: ClientDto[]
    editable: boolean
}

export interface ClientDetailDto extends ClientDto {
    orders: OrderSummaryDto[]
    own: boolean
    editable: boolean
}

// ── Pedidos ────────────────────────────────────────────────────────────────

export interface OrderItemDto {
    id: string
    activityId: string
    activityName: string
    minutes: number
    hourlyRateCents: number
    subtotalCents: number
}

export interface OrderAttachmentDto extends BusinessFileDto {
    clientVisible: boolean
}

export interface OrderDecisionDto {
    kind: "accept" | "reject"
    by: OrderDecider
    actorId: string | null
    actorName: string | null
    /** Nome informado por quem decidiu (cliente pelo link: obrigatório no aceite). */
    name: string | null
    reason: string | null
    ip: string | null
    at: string
    versionNumber: number | null
}

export interface OrderLinkDto {
    validUntil: string
    sentAt: string
    expired: boolean
    emailedAt: string | null
}

export interface OrderSummaryDto {
    id: string
    businessId: string
    businessName: string | null
    code: string
    number: number
    clientId: string
    clientName: string | null
    /** Título exibido: o manual/IA ou a primeira linha da descrição. */
    displayTitle: string
    status: OrderStatus
    currency: string
    totalCents: number
    totalMinutes: number
    dueDate: string | null
    deadlineAlertDays: number
    link: OrderLinkDto | null
    workId: string | null
    createdAt: string
    updatedAt: string
}

export interface OrderVersionDto {
    number: number
    reason: OrderVersionReason
    /** Versão publicada no link (enviada ou alterada com o link ativo). */
    published: boolean
    actorId: string | null
    actorName: string | null
    snapshot: OrderSnapshot
    /** Diferenças para a versão anterior (todas, para o prestador). */
    changes: OrderChange[]
    createdAt: string
}

export interface OrderDto extends OrderSummaryDto {
    description: string
    title: string | null
    summary: string | null
    titleManual: boolean
    summaryManual: boolean
    aiStatus: OrderAiStatus
    aiError: string | null
    items: OrderItemDto[]
    suggestedTotalCents: number
    totalManual: boolean
    attachments: OrderAttachmentDto[]
    decision: OrderDecisionDto | null
    decisions: OrderDecisionDto[]
    versions: OrderVersionDto[]
    firstSentAt: string | null
    cancelledAt: string | null
    version: number
    /** Dono com `businesses.use`, negócio ativo e status editável. */
    editable: boolean
    /** Ações permitidas agora (somente leitura = vazio). */
    actions: OrderAction[]
    /** Validade padrão do negócio (dias) para o próximo envio. */
    quoteValidityDays: number
}

export interface OrderListDto {
    items: OrderSummaryDto[]
    editable: boolean
}

/** URL do link (só quando o próprio usuário pede "Copiar link"). */
export interface OrderLinkUrlDto {
    url: string
    validUntil: string
}

export interface OrderSendResultDto {
    order: OrderDto
    url: string
    email: "sent" | "skipped" | "no-email" | "smtp-unavailable" | "failed" | null
}

export interface WorkDto {
    id: string
    businessId: string
    orderId: string
    code: string
    column: WorkFixedColumn
    estimatedMinutes: number
    totalCents: number
    createdAt: string
}

// ── Link público ───────────────────────────────────────────────────────────

export interface PublicQuoteDto {
    state: "open" | "expired" | "accepted" | "rejected" | "unavailable"
    code: string
    business: {
        name: string
        description: string | null
        links: string[]
        logoUrl: string | null
        contactEmail: string | null
        contactPhone: string | null
        theme: { primaryColor: string; mode: "dark" | "light" }
    }
    title: string
    description: string
    currency: string
    items: { activityName: string; minutes: number; hourlyRateCents: number; subtotalCents: number }[]
    totalCents: number
    dueDate: string | null
    validUntil: string
    attachments: { id: string; name: string; mediaType: string; size: number; url: string }[]
    /** Versões publicadas (enviadas), da mais recente para a mais antiga, com o que mudou. */
    history: { number: number; reason: OrderVersionReason; at: string; changes: OrderChange[] }[]
    decision: { kind: "accept" | "reject"; name: string | null; reason: string | null; at: string } | null
}

// ── Configuração ───────────────────────────────────────────────────────────

export interface OrderTitleFeatureDto {
    settings: OrderTitleFeatureSettings
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
}
