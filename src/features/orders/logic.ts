import { ORDER_TITLE_MAX, type OrderAction, type OrderStatus } from "./constants"

/**
 * Regras puras dos pedidos (tela, servidor e agente): valores, horas `h:mm`, máquina de estados,
 * diferenças entre versões, alerta de prazo, validade do link e título exibido.
 */

// ── Valores e horas ────────────────────────────────────────────────────────

/** Subtotal de um item: horas estimadas × valor/hora congelado (unidades mínimas, arredondado). */
export const itemSubtotalCents = (minutes: number, hourlyRateCents: number) => Math.round((minutes * hourlyRateCents) / 60)

/** Total sugerido: Σ horas × valor/hora. */
export function suggestedTotalCents(items: readonly { minutes: number; hourlyRateCents: number }[]): number {
    return items.reduce((sum, item) => sum + itemSubtotalCents(item.minutes, item.hourlyRateCents), 0)
}

export const totalMinutes = (items: readonly { minutes: number }[]) => items.reduce((sum, item) => sum + item.minutes, 0)

/** Minutos → `h:mm` (ex.: 90 → "1:30"). */
export function formatMinutes(minutes: number): string {
    const safe = Math.max(0, Math.round(minutes))
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`
}

/** `h:mm` (ou horas inteiras "3") → minutos; `null` se inválido. Minutos de 0 a 59. */
export function parseHoursInput(value: string): number | null {
    const text = value.trim()
    if (!text) return null
    const match = /^(\d{1,5})(?::([0-5]\d))?$/.exec(text)
    if (!match) return null
    return Number(match[1]) * 60 + Number(match[2] ?? 0)
}

// ── Estados ────────────────────────────────────────────────────────────────

const TRANSITIONS: Record<OrderAction, readonly OrderStatus[]> = {
    edit: ["draft", "sent"],
    send: ["draft", "sent"],
    revoke: ["sent"],
    accept: ["sent"],
    reject: ["sent"],
    reopen: ["rejected"],
    cancel: ["draft", "sent"],
}

export const canOrderTransition = (status: OrderStatus, action: OrderAction) => TRANSITIONS[action].includes(status)

/** Estado depois da ação (`edit`/`send` mantêm ou levam a Enviado). */
export function nextOrderStatus(status: OrderStatus, action: OrderAction): OrderStatus {
    switch (action) {
        case "edit":
            return status
        case "send":
            return "sent"
        case "revoke":
        case "reopen":
            return "draft"
        case "accept":
            return "accepted"
        case "reject":
            return "rejected"
        case "cancel":
            return "cancelled"
    }
}

export const allowedOrderActions = (status: OrderStatus): OrderAction[] => (Object.keys(TRANSITIONS) as OrderAction[]).filter((action) => canOrderTransition(status, action))

// ── Versões ────────────────────────────────────────────────────────────────

/** O que o cliente vê de cada versão (cópia imutável). */
export interface OrderSnapshot {
    title: string
    description: string
    currency: string
    items: { activityName: string; minutes: number; hourlyRateCents: number }[]
    totalCents: number
    totalManual: boolean
    dueDate: string | null
    attachments: { id: string; name: string }[]
}

export type OrderChange =
    | { field: "title" | "description"; before: string; after: string }
    | { field: "dueDate"; before: string | null; after: string | null }
    | { field: "totalCents"; before: number; after: number }
    | { field: "item"; kind: "added" | "removed"; activityName: string; minutes: number; hourlyRateCents: number }
    | { field: "item"; kind: "changed"; activityName: string; before: { minutes: number; hourlyRateCents: number }; after: { minutes: number; hourlyRateCents: number } }
    | { field: "attachment"; kind: "added" | "removed"; name: string }

/** Diferenças de uma versão para a seguinte (itens pareados pela posição e pelo nome da atividade). */
export function diffOrderSnapshots(previous: OrderSnapshot | null, next: OrderSnapshot): OrderChange[] {
    if (!previous) return []
    const changes: OrderChange[] = []
    if (previous.title !== next.title) changes.push({ field: "title", before: previous.title, after: next.title })
    if (previous.description !== next.description) changes.push({ field: "description", before: previous.description, after: next.description })
    const pending = [...previous.items]
    for (const item of next.items) {
        const index = pending.findIndex((candidate) => candidate.activityName === item.activityName)
        if (index === -1) {
            changes.push({ field: "item", kind: "added", ...item })
            continue
        }
        const [before] = pending.splice(index, 1)
        if (before!.minutes !== item.minutes || before!.hourlyRateCents !== item.hourlyRateCents) {
            changes.push({ field: "item", kind: "changed", activityName: item.activityName, before: { minutes: before!.minutes, hourlyRateCents: before!.hourlyRateCents }, after: { minutes: item.minutes, hourlyRateCents: item.hourlyRateCents } })
        }
    }
    for (const removed of pending) changes.push({ field: "item", kind: "removed", ...removed })
    if (previous.totalCents !== next.totalCents) changes.push({ field: "totalCents", before: previous.totalCents, after: next.totalCents })
    if (previous.dueDate !== next.dueDate) changes.push({ field: "dueDate", before: previous.dueDate, after: next.dueDate })
    const beforeFiles = new Set(previous.attachments.map((file) => file.id))
    const afterFiles = new Set(next.attachments.map((file) => file.id))
    for (const file of next.attachments) if (!beforeFiles.has(file.id)) changes.push({ field: "attachment", kind: "added", name: file.name })
    for (const file of previous.attachments) if (!afterFiles.has(file.id)) changes.push({ field: "attachment", kind: "removed", name: file.name })
    return changes
}

export const sameSnapshot = (a: OrderSnapshot | null, b: OrderSnapshot) => Boolean(a) && JSON.stringify(a) === JSON.stringify(b)

// ── Prazos ─────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000
const keyToUtc = (key: string) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)))
export const daysBetweenKeys = (from: string, to: string) => Math.round((keyToUtc(to) - keyToUtc(from)) / DAY_MS)
export function addDaysToKey(key: string, days: number): string {
    return new Date(keyToUtc(key) + days * DAY_MS).toISOString().slice(0, 10)
}

export type DeadlineAlert = { kind: "overdue"; days: number } | { kind: "soon"; days: number }

/**
 * Alerta de prazo (M3 §7): "Atrasado" depois da data de entrega; "Vence em X dias" dentro da
 * antecedência do negócio (0 = vence hoje). Sem data, nenhum alerta.
 */
export function deadlineAlert(dueDate: string | null | undefined, todayKey: string, alertDays: number): DeadlineAlert | null {
    if (!dueDate) return null
    const days = daysBetweenKeys(todayKey, dueDate)
    if (days < 0) return { kind: "overdue", days: -days }
    if (days <= alertDays) return { kind: "soon", days }
    return null
}

export function deadlineAlertLabel(alert: DeadlineAlert): string {
    if (alert.kind === "overdue") return "Atrasado"
    if (alert.days === 0) return "Vence hoje"
    return alert.days === 1 ? "Vence em 1 dia" : `Vence em ${alert.days} dias`
}

/** Link vencido: "hoje" (no fuso de quem enviou) depois do "válido até". */
export const quoteExpired = (validUntil: string, todayKey: string) => todayKey > validUntil

// ── Título ─────────────────────────────────────────────────────────────────

/** Até a IA gerar (ou sem IA), o título exibido é a primeira linha da descrição. */
export function firstLine(description: string, max = ORDER_TITLE_MAX): string {
    const line = description.split(/\r?\n/).map((part) => part.trim()).find(Boolean) ?? ""
    return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

export const displayOrderTitle = (order: { title: string | null; description: string }) => order.title?.trim() || firstLine(order.description) || "Pedido sem descrição"
