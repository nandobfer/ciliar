import { dbConnect } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import { todayKeyIn } from "@/lib/timezone"
import { quoteExpired } from "@/features/orders/logic"
import { orderModels } from "@/features/orders/server/models"
import { calendarModels } from "../models"
import { renewChannelSafely } from "./channel"
import { inBackoff, type ConnectionDoc } from "./connection"
import { processPublishQueue } from "./publish"
import { syncConnection } from "./sync"

const log = loggerFor({ module: "calendar.google" })

/**
 * Pedidos enviados com o link vencido: expirar não é uma transição de status, então a rotina marca o
 * vínculo para o título ganhar "[Expirado]".
 */
export async function markExpiredOrders(connection: ConnectionDoc): Promise<number> {
    const links = calendarModels().links
    const candidates = await links.find({ ownerId: connection.ownerId, kind: "order-deadline", status: "linked", "snapshot.statusTag": { $ne: "Expirado" } }).select({ refId: 1 }).lean()
    if (!candidates.length) return 0
    const orders = await orderModels().orders.find({ _id: { $in: candidates.map((link) => link.refId) }, status: "sent" }).select({ link: 1 }).lean()
    const expired = orders.filter((order) => order.link && quoteExpired(order.link.validUntil, todayKeyIn(order.link.timeZone ?? connection.timeZone))).map((order) => String(order._id))
    if (!expired.length) return 0
    const result = await links.updateMany({ ownerId: connection.ownerId, kind: "order-deadline", refId: { $in: expired } }, { $set: { dirty: true, nextAttemptAt: null } })
    return result.modifiedCount
}

/**
 * Rotina `calendar-google-sync` (agendador interno): para cada conexão ativa, renova o canal de
 * notificação, sincroniza com `syncToken` (garantia do push), marca os pedidos expirados e processa
 * a fila de publicação. Conexões em espera pela cota ficam para a próxima rodada.
 */
export async function runCalendarGoogleSync(): Promise<string> {
    await dbConnect()
    const connections = await calendarModels().connections.find({ status: { $in: ["active", "error"] } }).lean<ConnectionDoc[]>()
    let synced = 0
    let published = 0
    let failed = 0
    for (const connection of connections) {
        if (inBackoff(connection)) continue
        try {
            if (connection.status === "error") await calendarModels().connections.updateOne({ _id: connection._id, status: "error" }, { $set: { status: connection.publishCalendar ? "active" : "choose_calendar" } })
            const current = (await calendarModels().connections.findOne({ _id: connection._id }).lean<ConnectionDoc>())!
            if (current.status !== "active") continue
            // Só a falha do token interrompe (a conexão já foi marcada); a do canal fica no log e a rotina segue.
            if ((await renewChannelSafely(current)) === "token_failed") {
                failed += 1
                continue
            }
            const result = await syncConnection(current.ownerId)
            await markExpiredOrders(current)
            const queue = await processPublishQueue(current.ownerId)
            synced += 1
            published += queue.published
            if (result.errors || queue.errors) failed += 1
        } catch (error) {
            failed += 1
            log.warn({ err: error, ownerId: connection.ownerId }, "[calendar] Falha na rotina do Google Agenda")
        }
    }
    // Canais de conexões que precisam de reconexão não recebem mais avisos úteis.
    const stale = await calendarModels().connections.find({ status: "reauth", channel: { $ne: null } }).lean<ConnectionDoc[]>()
    for (const connection of stale) await calendarModels().connections.updateOne({ _id: connection._id }, { $set: { channel: null } })
    return `${synced} conexão(ões) sincronizada(s), ${published} evento(s) publicado(s)${failed ? `, ${failed} com falha` : ""}`
}
