import { deadlineAlert, type DeadlineAlert } from "@/features/orders/logic"
import type { WorkSortKey } from "./constants"

/**
 * Regras puras dos Trabalhos (tela, servidor e agente): ordenação dos cards e posição ao soltar
 * (copiadas do quadro de Tarefas do Opex), movimentos que pedem pagamento/confirmação, progresso das
 * horas, faturamento bruto e o alerta de prazo.
 */

// ── Ordenação e posição ────────────────────────────────────────────────────

interface Sortable {
    position: number
    createdAt: string
    dueDate: string | null
}

const createdMs = (work: Pick<Sortable, "createdAt">) => {
    const ms = work.createdAt ? new Date(work.createdAt).getTime() : 0
    return Number.isNaN(ms) ? 0 : ms
}

/** Não muta a lista recebida. Prazo: os sem data vão para o fim. */
export function sortWorks<T extends Sortable>(works: readonly T[], key: WorkSortKey): T[] {
    const copy = [...works]
    switch (key) {
        case "manual":
            return copy.sort((a, b) => a.position - b.position || createdMs(a) - createdMs(b))
        case "newest":
            return copy.sort((a, b) => createdMs(b) - createdMs(a) || a.position - b.position)
        case "oldest":
            return copy.sort((a, b) => createdMs(a) - createdMs(b) || a.position - b.position)
        case "due":
        default:
            return copy.sort((a, b) => (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99") || a.position - b.position)
    }
}

/** Ponto médio entre os vizinhos (só o trabalho arrastado muda). */
export function computeDropOrder(prev?: number, next?: number): number {
    const hasPrev = typeof prev === "number" && Number.isFinite(prev)
    const hasNext = typeof next === "number" && Number.isFinite(next)
    if (hasPrev && hasNext) return (prev + next) / 2
    if (hasPrev) return prev + 1
    if (hasNext) return next - 1
    return 0
}

/**
 * Posição para o índice `at` de uma coluna já ordenada pela posição. Com posições empatadas, o vizinho
 * de baixo é o primeiro MAIOR que o de cima (senão o ponto médio devolveria o próprio valor).
 */
export function computeDropOrderInList(orders: readonly number[], at: number): number {
    const index = Math.max(0, Math.min(at, orders.length))
    const prev = index > 0 ? orders[index - 1] : undefined
    const next = orders.slice(index).find((order) => prev === undefined || order > prev)
    return computeDropOrder(prev, next)
}

// ── Movimentos ─────────────────────────────────────────────────────────────

/** Que fluxo o movimento pede: pagamento (entrar em Pago), confirmação (sair de Pago) ou nenhum. */
export function moveFlowOf(from: string, to: string): "pay" | "unpay" | "move" | "none" {
    if (from === to) return "none"
    if (to === "paid") return "pay"
    if (from === "paid") return "unpay"
    return "move"
}

// ── Horas ──────────────────────────────────────────────────────────────────

/** Barra do card: apontadas ÷ estimadas (pode passar de 100%; sem estimativa, sem percentual). */
export function hoursProgress(estimatedMinutes: number, loggedMinutes: number): { percent: number | null; over: boolean } {
    if (estimatedMinutes <= 0) return { percent: null, over: loggedMinutes > 0 }
    const percent = Math.round((loggedMinutes / estimatedMinutes) * 100)
    return { percent, over: loggedMinutes > estimatedMinutes }
}

/** Valor do lançamento: minutos × valor/hora congelado. */
export const timeEntryValueCents = (minutes: number, hourlyRateCents: number) => Math.round((minutes * hourlyRateCents) / 60)

// ── Faturamento ────────────────────────────────────────────────────────────

export interface RevenueWork {
    status: "active" | "archived"
    column: string
    payment: { paidOn: string; receivedCents: number } | null
    loggedMinutes: number
}

/** O trabalho conta no faturamento: ativo (não arquivado), em Pago e com o pagamento registrado. */
export const countsAsRevenue = (work: Pick<RevenueWork, "status" | "column" | "payment">) => work.status === "active" && work.column === "paid" && Boolean(work.payment)

/**
 * Faturamento bruto da janela (datas `AAAA-MM-DD`, inclusivas): soma dos valores recebidos dos
 * trabalhos pagos pela data do pagamento; horas = as apontadas nesses trabalhos.
 */
export function measureRevenue(works: readonly RevenueWork[], window: { from: string; to: string }): { revenueCents: number; minutes: number } {
    let revenueCents = 0
    let minutes = 0
    for (const work of works) {
        if (!countsAsRevenue(work)) continue
        const day = work.payment!.paidOn
        if (day < window.from || day > window.to) continue
        revenueCents += work.payment!.receivedCents
        minutes += work.loggedMinutes
    }
    return { revenueCents, minutes }
}

// ── Prazo ──────────────────────────────────────────────────────────────────

/** Selo de prazo do card (M3): trabalhos em Pago não têm alerta. */
export function workDeadlineAlert(work: { column: string; dueDate: string | null }, todayKey: string, alertDays: number): DeadlineAlert | null {
    if (work.column === "paid") return null
    return deadlineAlert(work.dueDate, todayKey, alertDays)
}

/** Formas de pagamento sugeridas: as já usadas (mais recentes primeiro) e as padrão, sem repetir. */
export function paymentMethodOptions(used: readonly string[], defaults: readonly string[]): string[] {
    const seen = new Set<string>()
    const result: string[] = []
    for (const value of [...used, ...defaults]) {
        const text = value.trim()
        const key = text.toLocaleLowerCase("pt-BR")
        if (!text || seen.has(key)) continue
        seen.add(key)
        result.push(text)
    }
    return result
}
