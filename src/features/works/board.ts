import { isFixedWorkColumn, WORK_COLUMN_LABELS, WORK_FIXED_COLUMNS, WORK_OTHERS_COLUMN, WORK_OTHERS_LABEL, type WorkFixedColumn } from "./constants"

/**
 * Quadro dos Trabalhos (módulo PURO: tela e servidor). Adaptado do quadro de Tarefas do Opex: as 4
 * colunas fixas não mudam (nome, cor, ícone e ordem) e as customizadas de cada negócio ficam somente
 * entre Abertura e Pago, em qualquer ponto (antes ou depois de Execução/Validação).
 */

/** Chave de coluna customizada: `col-` + 12 caracteres (ex.: `col-3f8a1b2c9d0e`). */
export const WORK_COLUMN_KEY_PATTERN = /^col-[a-z0-9]{6,24}$/

export const COLUMN_COLORS = ["violet", "sky", "emerald", "amber", "rose", "cyan", "orange", "pink", "lime", "zinc"] as const
export type ColumnColor = (typeof COLUMN_COLORS)[number]

/** Classes completas (o Tailwind só gera o que aparece literal no código). */
export const COLUMN_COLOR_STYLES: Record<ColumnColor, { label: string; border: string; dot: string; swatch: string }> = {
    violet: { label: "Violeta", border: "border-t-violet-400", dot: "bg-violet-400", swatch: "bg-violet-500" },
    sky: { label: "Azul", border: "border-t-sky-400", dot: "bg-sky-400", swatch: "bg-sky-500" },
    emerald: { label: "Verde", border: "border-t-emerald-400", dot: "bg-emerald-400", swatch: "bg-emerald-500" },
    amber: { label: "Âmbar", border: "border-t-amber-400", dot: "bg-amber-400", swatch: "bg-amber-500" },
    rose: { label: "Rosa", border: "border-t-rose-400", dot: "bg-rose-400", swatch: "bg-rose-500" },
    cyan: { label: "Ciano", border: "border-t-cyan-400", dot: "bg-cyan-400", swatch: "bg-cyan-500" },
    orange: { label: "Laranja", border: "border-t-orange-400", dot: "bg-orange-400", swatch: "bg-orange-500" },
    pink: { label: "Pink", border: "border-t-pink-400", dot: "bg-pink-400", swatch: "bg-pink-500" },
    lime: { label: "Lima", border: "border-t-lime-400", dot: "bg-lime-400", swatch: "bg-lime-500" },
    zinc: { label: "Cinza", border: "border-t-zinc-400", dot: "bg-zinc-400", swatch: "bg-zinc-500" },
}

/** Ícones disponíveis para colunas (componentes em `components/column-icons.tsx`). */
export const COLUMN_ICON_KEYS = [
    "star",
    "flag",
    "bookmark",
    "clock",
    "hourglass",
    "pause",
    "eye",
    "search",
    "message",
    "users",
    "user",
    "bug",
    "wrench",
    "code",
    "test",
    "rocket",
    "check",
    "dot",
    "alert",
    "flame",
    "zap",
    "lightbulb",
    "inbox",
    "archive",
    "calendar",
    "target",
    "coffee",
    "heart",
    "brain",
    "shield",
    "package",
    "list",
    "layers",
] as const
export type ColumnIcon = (typeof COLUMN_ICON_KEYS)[number]

export interface WorkColumnDto {
    key: string
    name: string
    color: ColumnColor
    icon: ColumnIcon
    description: string | null
    /** Fixa (Abertura, Execução, Validação, Pago): sem editar, mover ou excluir. */
    fixed: boolean
}

export interface WorkBoardDto {
    businessId: string
    /** Colunas na ordem do quadro (fixas + customizadas). */
    columns: WorkColumnDto[]
    /** Ordem das colunas (chaves). */
    layout: string[]
    /** Trabalhos por coluna, inclusive arquivados (exclusão só de coluna vazia). */
    counts: Record<string, number>
    editable: boolean
}

/** As fixas: nome, cor e ícone que nunca mudam. */
export const FIXED_WORK_COLUMNS: Record<WorkFixedColumn, WorkColumnDto> = {
    opening: { key: "opening", name: WORK_COLUMN_LABELS.opening, color: "zinc", icon: "inbox", description: "Pedido aceito, aguardando o início", fixed: true },
    execution: { key: "execution", name: WORK_COLUMN_LABELS.execution, color: "sky", icon: "clock", description: "Trabalho em andamento", fixed: true },
    validation: { key: "validation", name: WORK_COLUMN_LABELS.validation, color: "amber", icon: "eye", description: "Entregue, aguardando a validação do cliente", fixed: true },
    paid: { key: "paid", name: WORK_COLUMN_LABELS.paid, color: "emerald", icon: "check", description: "Pagamento recebido: entra no faturamento pela data do pagamento", fixed: true },
}

/**
 * Normaliza a ordem salva: Abertura primeiro, Pago por último, Execução antes de Validação e as
 * customizadas no trecho em que estavam (antes de Abertura vira logo depois dela; depois de Pago, logo
 * antes dela). Chaves desconhecidas/repetidas saem; customizadas que faltam entram antes de Pago.
 */
export function normalizeWorkLayout(order: readonly string[], customKeys: readonly string[]): string[] {
    const known = new Set(customKeys)
    const seen = new Set<string>()
    const segments: string[][] = [[], [], []]
    let segment = 0
    for (const key of order) {
        if (key === "execution") segment = Math.max(segment, 1)
        else if (key === "validation") segment = 2
        else if (known.has(key) && !seen.has(key)) {
            seen.add(key)
            segments[segment]!.push(key)
        }
    }
    for (const key of customKeys) if (!seen.has(key)) segments[2]!.push(key)
    return ["opening", ...segments[0]!, "execution", ...segments[1]!, "validation", ...segments[2]!, "paid"]
}

/** A ordem respeita as fixas (nada antes de Abertura nem depois de Pago, fixas na ordem)? */
export function isValidWorkLayout(order: readonly string[], customKeys: readonly string[]): boolean {
    const normalized = normalizeWorkLayout(order, customKeys)
    return normalized.length === order.length && normalized.every((key, index) => order[index] === key)
}

/** Coloca `key` logo depois de `afterKey` (sem `afterKey` ou depois de Pago: antes de Pago). */
export function placeColumnAfter(layout: readonly string[], key: string, afterKey?: string | null): string[] {
    const without = layout.filter((item) => item !== key)
    const anchor = afterKey && afterKey !== "paid" ? without.indexOf(afterKey) : -1
    if (anchor === -1) {
        const paid = without.indexOf("paid")
        return paid === -1 ? [...without, key] : [...without.slice(0, paid), key, ...without.slice(paid)]
    }
    return [...without.slice(0, anchor + 1), key, ...without.slice(anchor + 1)]
}

/** Nova ordem completa a partir da reordenação das colunas VISÍVEIS: as posições delas recebem a nova sequência. */
export function mergeVisibleOrder(layout: readonly string[], visibleNewOrder: readonly string[]): string[] {
    const visible = new Set(visibleNewOrder)
    const queue = [...visibleNewOrder]
    return layout.map((key) => (visible.has(key) ? queue.shift()! : key))
}

/** Move uma customizada uma posição (esquerda/direita) sem passar de Abertura nem de Pago. */
export function shiftColumn(layout: readonly string[], key: string, direction: -1 | 1): string[] | null {
    const index = layout.indexOf(key)
    const to = index + direction
    if (index === -1 || isFixedWorkColumn(key) || to <= 0 || to >= layout.length - 1) return null
    const next = [...layout]
    ;[next[index], next[to]] = [next[to]!, next[index]!]
    return next
}

/** Coluna pronta para a tela. */
export interface BoardColumnView {
    key: string
    label: string
    border: string
    dot: string
    column: WorkColumnDto
}

export function columnView(column: WorkColumnDto): BoardColumnView {
    const style = COLUMN_COLOR_STYLES[column.color] ?? COLUMN_COLOR_STYLES.violet
    return { key: column.key, label: column.name, border: style.border, dot: style.dot, column }
}

/** Colunas do quadro do negócio na ordem salva. */
export function buildBoardColumns(board: Pick<WorkBoardDto, "columns" | "layout"> | undefined): BoardColumnView[] {
    const byKey = new Map<string, WorkColumnDto>([...WORK_FIXED_COLUMNS.map((key) => [key, FIXED_WORK_COLUMNS[key]] as const), ...(board?.columns ?? []).map((column) => [column.key, column] as const)])
    const customs = (board?.columns ?? []).filter((column) => !column.fixed).map((column) => column.key)
    return normalizeWorkLayout(board?.layout ?? [], customs).map((key) => columnView(byKey.get(key)!))
}

/** Coluna agrupada "Outras etapas" da visão geral (todas as customizadas de todos os negócios). */
export const OTHERS_COLUMN: WorkColumnDto = { key: WORK_OTHERS_COLUMN, name: WORK_OTHERS_LABEL, color: "violet", icon: "layers", description: "Etapas customizadas dos negócios: mova para elas dentro do negócio", fixed: true }

/** Visão geral: as 4 fixas + "Outras etapas" (antes de Pago). */
export function overviewColumns(): BoardColumnView[] {
    return [FIXED_WORK_COLUMNS.opening, FIXED_WORK_COLUMNS.execution, FIXED_WORK_COLUMNS.validation, OTHERS_COLUMN, FIXED_WORK_COLUMNS.paid].map(columnView)
}

/** Em que coluna o card aparece: a real no negócio; na visão geral, as customizadas vão para "Outras etapas". */
export const boardColumnOf = (work: { column: string }, overview: boolean): string => (overview && !isFixedWorkColumn(work.column) ? WORK_OTHERS_COLUMN : work.column)
