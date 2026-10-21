import { formatMoney } from "@/features/businesses/format"
import { formatMinutes, type OrderChange } from "./logic"

/** Texto de cada alteração do histórico (módulo puro: tela do prestador e link do cliente). */

const dateLabel = (key: string | null) => (key ? key.split("-").reverse().join("/") : "sem data")
const clip = (text: string, max = 80) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

export function describeOrderChange(change: OrderChange, currency: string): string {
    switch (change.field) {
        case "title":
            return `Título: “${clip(change.before)}” → “${clip(change.after)}”`
        case "description":
            return "Descrição alterada"
        case "dueDate":
            return `Entrega: ${dateLabel(change.before)} → ${dateLabel(change.after)}`
        case "totalCents":
            return `Valor total: ${formatMoney(change.before, currency)} → ${formatMoney(change.after, currency)}`
        case "attachment":
            return `${change.kind === "added" ? "Anexo incluído" : "Anexo removido"}: ${change.name}`
        case "item":
            if (change.kind === "changed") {
                const parts = []
                if (change.before.minutes !== change.after.minutes) parts.push(`${formatMinutes(change.before.minutes)} h → ${formatMinutes(change.after.minutes)} h`)
                if (change.before.hourlyRateCents !== change.after.hourlyRateCents) parts.push(`${formatMoney(change.before.hourlyRateCents, currency)}/h → ${formatMoney(change.after.hourlyRateCents, currency)}/h`)
                return `${change.activityName}: ${parts.join(", ")}`
            }
            return `${change.kind === "added" ? "Item incluído" : "Item removido"}: ${change.activityName} (${formatMinutes(change.minutes)} h × ${formatMoney(change.hourlyRateCents, currency)}/h)`
    }
}
