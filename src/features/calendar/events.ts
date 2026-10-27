import { createHash } from "node:crypto"
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/features/orders/constants"
import { addDaysToKey } from "./time"
import type { GoogleLinkKind } from "./constants"

/**
 * Texto dos eventos publicados no Google (módulo puro do servidor). Título e descrição são do Ciliar e
 * sempre sobrescrevem edições feitas no Google. Os eventos ficam como histórico: o status entra no
 * título quando o trabalho vai para Pago/é arquivado/excluído ou o pedido sai de aberto.
 */

export interface PublishSource {
    kind: GoogleLinkKind
    linkId: string
    code: string
    title: string
    businessName: string
    clientName: string | null
    /** Início (período) e prazo. */
    startKey: string | null
    dueDate: string
    /** Situação para o título: `null` = em andamento/aberto. */
    statusTag: string | null
    columnName: string | null
    estimatedMinutes: number
    url: string
}

export interface GoogleEventBody {
    summary: string
    description: string
    start: { date: string }
    end: { date: string }
    transparency: "transparent"
    extendedProperties: { private: Record<string, string> }
}

/** Situação do trabalho no título do evento. */
export function workStatusTag(work: { column: string; status: "active" | "archived" } | null): string | null {
    if (!work) return "Excluído"
    if (work.status === "archived") return "Arquivado"
    if (work.column === "paid") return "Pago"
    return null
}

/** Situação do pedido no título do evento (`expired` = link vencido). */
export function orderStatusTag(status: OrderStatus, expired: boolean): string | null {
    if (status === "draft") return null
    if (status === "sent") return expired ? "Expirado" : null
    return ORDER_STATUS_LABELS[status]
}

const hours = (minutes: number) => `${Math.floor(minutes / 60)}:${String(Math.round(minutes % 60)).padStart(2, "0")}`

export function googleEventBody(source: PublishSource): GoogleEventBody {
    const tag = source.statusTag ? ` [${source.statusTag}]` : ""
    const head = `${source.code} · ${source.title}`
    const summary =
        source.kind === "work-deadline" ? `Prazo: ${head}${tag}` : source.kind === "work-period" ? `Execução: ${head}${tag}` : `Prazo do pedido: ${head}${tag}`
    const lines = [
        `Negócio: ${source.businessName}`,
        source.clientName ? `Cliente: ${source.clientName}` : null,
        source.columnName ? `Etapa: ${source.columnName}` : null,
        source.estimatedMinutes ? `Horas estimadas: ${hours(source.estimatedMinutes)}` : null,
        source.kind === "work-period" && source.startKey ? `Período: ${source.startKey} a ${source.dueDate}` : `Prazo: ${source.dueDate}`,
        source.statusTag ? `Situação: ${source.statusTag}` : null,
        "",
        `Abrir no Ciliar: ${source.url}`,
        "Evento gerado pelo Ciliar: o título e a descrição são reescritos a cada atualização. Mover a data altera o prazo.",
    ].filter((line): line is string => line !== null)
    const startKey = source.kind === "work-period" && source.startKey && source.startKey <= source.dueDate ? source.startKey : source.dueDate
    return {
        summary,
        description: lines.join("\n"),
        start: { date: startKey },
        // Dia inteiro no Google: o fim é exclusivo.
        end: { date: addDaysToKey(source.dueDate, 1) },
        transparency: "transparent",
        extendedProperties: { private: { ciliar: "1", ciliarLinkId: source.linkId, ciliarKind: source.kind } },
    }
}

/** Hash do que foi publicado (para ignorar o eco da própria mudança e evitar ciclo). */
export function pushedHash(body: Pick<GoogleEventBody, "summary" | "description" | "start" | "end">): string {
    return createHash("sha256").update(JSON.stringify([body.summary, body.description, body.start.date, body.end.date])).digest("hex")
}

/**
 * Data nova vinda do Google (evento de dia inteiro): o fim exclusivo menos um dia vira o prazo. Eventos
 * com hora usam o dia do fim no fuso informado pelo chamador (`dateTimeKey`).
 */
export function dueDateFromGoogle(event: { end?: { date?: string | null; dateTime?: string | null } | null }, dateTimeKey: (iso: string) => string): string | null {
    const end = event.end
    if (end?.date) return addDaysToKey(end.date, -1)
    if (end?.dateTime) return dateTimeKey(end.dateTime)
    return null
}
