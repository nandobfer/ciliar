import type { BusinessFileDto } from "@/features/businesses/types"
import type { OrderItemDto, OrderVersionDto } from "@/features/orders/types"
import type { TimeEntrySource, WorkPaymentEvent } from "./constants"

/** DTOs dos Trabalhos (M4). Valores em unidades mínimas; horas em minutos. */

export interface WorkPaymentDto {
    /** `AAAA-MM-DD`: data usada no faturamento das metas. */
    paidOn: string
    receivedCents: number
    method: string | null
    at: string
}

export interface WorkSummaryDto {
    id: string
    businessId: string
    businessName: string | null
    orderId: string
    code: string
    title: string
    clientId: string
    clientName: string | null
    /** Coluna real (fixa ou customizada). */
    column: string
    columnName: string
    position: number
    estimatedMinutes: number
    loggedMinutes: number
    totalCents: number
    currency: string
    dueDate: string | null
    deadlineAlertDays: number
    payment: WorkPaymentDto | null
    status: "active" | "archived"
    archivedAt: string | null
    purgeAt: string | null
    successId: string | null
    version: number
    createdAt: string
    updatedAt: string
}

export interface WorkListDto {
    items: WorkSummaryDto[]
    editable: boolean
}

export interface WorkPaymentEventDto {
    kind: WorkPaymentEvent
    paidOn: string | null
    receivedCents: number | null
    method: string | null
    at: string
    actorName: string | null
}

export interface WorkMoveDto {
    id: string
    from: string | null
    fromName: string | null
    to: string
    toName: string
    at: string
    actorName: string | null
    /** Origem: tela/agente (ator) ou a criação pelo aceite. */
    by: "user" | "client" | "system"
}

export interface WorkNoteDto {
    id: string
    authorId: string
    authorName: string | null
    content: string
    createdAt: string
    editedAt: string | null
    /** O usuário real é o autor (só ele edita/exclui). */
    mine: boolean
}

export interface TimeEntryDto {
    id: string
    workId: string
    source: TimeEntrySource
    refId: string
    name: string
    hourlyRateCents: number
    valueCents: number
    date: string
    minutes: number
    description: string | null
    authorName: string | null
    version: number
    createdAt: string
    updatedAt: string
}

export interface WorkDetailDto extends WorkSummaryDto {
    orderVersion: number
    items: OrderItemDto[]
    suggestedTotalCents: number
    totalManual: boolean
    /** Histórico de versões do pedido (inclusive as alterações pelo trabalho). */
    versions: OrderVersionDto[]
    payments: WorkPaymentEventDto[]
    moves: WorkMoveDto[]
    notes: WorkNoteDto[]
    timeEntries: TimeEntryDto[]
    attachments: BusinessFileDto[]
    success: { id: string; title: string; status: "active" | "archived" } | null
    /** Dono com `businesses.use`, negócio ativo e trabalho ativo. */
    editable: boolean
}
