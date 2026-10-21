/** Constantes dos Trabalhos (M4; módulo puro: tela e servidor). Ver `aicontext/modules/works.md`. */

/**
 * Colunas fixas do quadro, sem nenhuma alteração (nome, cor e ordem). As customizadas de cada negócio
 * ficam somente entre Abertura e Pago.
 */
export const WORK_FIXED_COLUMNS = ["opening", "execution", "validation", "paid"] as const
export type WorkFixedColumn = (typeof WORK_FIXED_COLUMNS)[number]
export const WORK_COLUMN_LABELS: Record<WorkFixedColumn, string> = { opening: "Abertura", execution: "Execução", validation: "Validação", paid: "Pago" }
export const isFixedWorkColumn = (key: string): key is WorkFixedColumn => (WORK_FIXED_COLUMNS as readonly string[]).includes(key)

/** Coluna agrupada da visão geral: todas as customizadas ("Outras etapas"). */
export const WORK_OTHERS_COLUMN = "others"
export const WORK_OTHERS_LABEL = "Outras etapas"

/** Ordenação dos cards (seletor do Opex, sem prioridade). */
export const WORK_SORT_KEYS = ["manual", "due", "newest", "oldest"] as const
export type WorkSortKey = (typeof WORK_SORT_KEYS)[number]
export const WORK_SORT_LABELS: Record<WorkSortKey, string> = { manual: "Manual", due: "Prazo", newest: "Mais novos", oldest: "Mais antigos" }

export const WORK_VIEW_MODES = ["kanban", "table"] as const
export type WorkViewMode = (typeof WORK_VIEW_MODES)[number]

export const WORKS_PATH = "/trabalhos"
export const workHref = (businessId: string, workId: string) => `/negocios/${businessId}/trabalhos/${workId}`

export const WORK_COLUMN_NAME_MAX = 40
export const WORK_COLUMN_DESCRIPTION_MAX = 200
/** Colunas customizadas por negócio. */
export const WORK_CUSTOM_COLUMNS_MAX = 20
export const WORK_NOTE_MAX = 4000
export const WORK_TIME_DESCRIPTION_MAX = 500
/** Um lançamento cobre no máximo 24:00 (um dia trabalhado). */
export const WORK_TIME_ENTRY_MINUTES_MAX = 24 * 60
export const WORK_PAYMENT_METHOD_MAX = 60
export const WORK_ATTACHMENTS_MAX = 50
/** Formas de pagamento sugeridas antes de existirem as já usadas pelo usuário. */
export const DEFAULT_PAYMENT_METHODS = ["PIX", "Transferência", "Boleto", "Cartão", "Dinheiro"] as const

/** Origem do item do lançamento de horas: item do pedido ou atividade do negócio fora do pedido. */
export const TIME_ENTRY_SOURCES = ["orderItem", "activity"] as const
export type TimeEntrySource = (typeof TIME_ENTRY_SOURCES)[number]

/** Histórico do pagamento: marcado (entrou em Pago), corrigido e estornado (saiu de Pago). */
export const WORK_PAYMENT_EVENTS = ["marked", "edited", "unmarked"] as const
export type WorkPaymentEvent = (typeof WORK_PAYMENT_EVENTS)[number]
export const WORK_PAYMENT_EVENT_LABELS: Record<WorkPaymentEvent, string> = { marked: "Pagamento registrado", edited: "Pagamento corrigido", unmarked: "Saiu de Pago (estorno do faturamento)" }

export const WORK_AUDIT = "business.work"
export const WORK_COLUMN_AUDIT = "business.work_column"
export const WORK_TIME_AUDIT = "business.work_time"
export const WORK_NOTE_AUDIT = "business.work_note"
export const WORK_FILE_AUDIT = "business.work_file"
