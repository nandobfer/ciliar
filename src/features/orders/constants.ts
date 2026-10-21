/** Constantes de Clientes e Pedidos (M3; módulo puro: tela e servidor). */

// ── Clientes ───────────────────────────────────────────────────────────────

export const CLIENT_NAME_MAX = 160
export const CLIENT_EMAIL_MAX = 200
export const CLIENT_PHONE_MAX = 30
export const CLIENT_NOTES_MAX = 4000

export const CLIENTS_PATH = "/clientes"
export const clientPath = (id: string) => `${CLIENTS_PATH}/${id}`

// ── Pedidos ────────────────────────────────────────────────────────────────

/**
 * Rascunho → Enviado → Aceito (gera o Trabalho em "Abertura") | Recusado (→ Reabrir → Rascunho).
 * Rascunho/Enviado → Cancelado (final, revoga o link).
 */
export const ORDER_STATUSES = ["draft", "sent", "accepted", "rejected", "cancelled"] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
    draft: "Rascunho",
    sent: "Enviado",
    accepted: "Aceito",
    rejected: "Recusado",
    cancelled: "Cancelado",
}
/** Pedidos "abertos" (alerta de prazo, M3 §7). */
export const OPEN_ORDER_STATUSES: readonly OrderStatus[] = ["draft", "sent"]

/** Ações sobre o pedido (máquina de estados em `logic.ts`). */
export const ORDER_ACTIONS = ["edit", "send", "revoke", "accept", "reject", "reopen", "cancel"] as const
export type OrderAction = (typeof ORDER_ACTIONS)[number]

/** Quem decidiu: o prestador (manual, com o ator) ou o cliente pelo link. */
export const ORDER_DECIDERS = ["provider", "client"] as const
export type OrderDecider = (typeof ORDER_DECIDERS)[number]

/** Motivo de cada versão: envio, edição salva depois do primeiro envio ou reabertura de um recusado. */
export const ORDER_VERSION_REASONS = ["send", "edit", "reopen"] as const
export type OrderVersionReason = (typeof ORDER_VERSION_REASONS)[number]
export const ORDER_VERSION_REASON_LABELS: Record<OrderVersionReason, string> = { send: "Enviado", edit: "Alterado", reopen: "Reaberto" }

export const ORDER_CODE_PREFIX = "PED-"
export const orderCode = (number: number) => `${ORDER_CODE_PREFIX}${String(number).padStart(4, "0")}`

export const ORDER_DESCRIPTION_MAX = 8000
export const ORDER_TITLE_MAX = 120
export const ORDER_SUMMARY_MAX = 400
export const ORDER_ITEMS_MAX = 50
export const ORDER_ATTACHMENTS_MAX = 20
/** Horas estimadas por item: até 10.000 h, em minutos. */
export const ORDER_ITEM_MINUTES_MAX = 10_000 * 60
export const ORDER_TOTAL_MAX_CENTS = 100_000_000_000_00
export const ORDER_DECISION_NAME_MAX = 160
export const ORDER_REJECT_REASON_MAX = 2000

/** Situação da geração do título/resumo por IA. */
export const ORDER_AI_STATUSES = ["idle", "pending", "done", "error"] as const
export type OrderAiStatus = (typeof ORDER_AI_STATUSES)[number]

// ── Link do orçamento ──────────────────────────────────────────────────────

/** Prefixo do token secreto do link (o valor só existe cifrado no banco + hash para a busca). */
export const ORDER_TOKEN_PREFIX = "ped_"
export const QUOTE_PAGE_PATH = "/orcamento"
export const quotePagePath = (token: string) => `${QUOTE_PAGE_PATH}/${token}`
/** Limites do link público por IP (janela de 15 min do limitador local). */
export const QUOTE_READ_LIMIT = 120
export const QUOTE_DECISION_LIMIT = 10

// ── Trabalhos (registro mínimo do M3; o Kanban é o M4) ──────────────────────

export const WORK_FIXED_COLUMNS = ["opening", "execution", "validation", "paid"] as const
export type WorkFixedColumn = (typeof WORK_FIXED_COLUMNS)[number]
export const WORK_COLUMN_LABELS: Record<WorkFixedColumn, string> = { opening: "Abertura", execution: "Execução", validation: "Validação", paid: "Pago" }

// ── Agente de título e resumo ───────────────────────────────────────────────

/** Configuração em `ai_feature_settings` (`feature: "order-title"`), aba "Título de pedidos". */
export const ORDER_TITLE_FEATURE = "order-title"
export const ORDER_TITLE_AI_TAB = "titulo-pedidos" as const
export const ORDER_TITLE_CONSUMPTION_ORIGIN = "order-title"

export const DEFAULT_ORDER_TITLE_INSTRUCTIONS = [
    "Você escreve o título e o resumo de pedidos de serviço do Ciliar, plataforma de prestadores de serviço.",
    "Leia a necessidade descrita pelo cliente e escreva, em português do Brasil, um título curto e objetivo (sem o código do pedido, sem aspas) e um resumo de uma linha.",
    "Não invente prazos, valores, nomes ou detalhes que não estejam na descrição.",
].join("\n")

// ── Eventos em tempo real (só invalidação) ─────────────────────────────────

/** No canal do dono (`private-businesses-{dono}`): `{ id }` do cliente. */
export const CLIENTS_UPDATED_EVENT = "clients-updated"
/** No canal do dono: `{ businessId, orderId }` quando o cliente decide pelo link (a tela relê e avisa). */
export const ORDER_DECIDED_EVENT = "order-decided"

export const CLIENT_AUDIT = "business.client"
export const ORDER_AUDIT = "business.order"
