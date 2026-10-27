import { dbConnect } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { normalizeTimeZone } from "@/lib/timezone"
import { denied } from "@/features/access/server/access"
import type { AccessContext } from "@/features/access/server/context"
import { businessOwnerOf, canSupportBusinesses, canUseModule, ensureBusinessCollections } from "@/features/businesses/server/access"
import { readBusiness } from "@/features/businesses/server/items"
import { totalMinutes } from "@/features/orders/logic"
import { orderModels } from "@/features/orders/server/models"
import type { OrderDoc } from "@/features/orders/server/order-dto"
import type { WorkDoc } from "@/features/works/server/core"
import { workModels } from "@/features/works/server/models"
import { deadlineConflict } from "../conflict"
import { deadlineConflictInputSchema } from "../schemas"
import { dayEnd, dayKeyOf } from "../time"
import type { DeadlineConflictDto } from "../types"
import { readGoogleEvents } from "./google/read"
import { acceptanceKey, availabilitiesOf, conflictWorksOf, loadOwnerScope } from "./scope"

/**
 * Verificação de conflito de prazo (CIL-4) — SOMENTE servidor: monta a entrada da função pura
 * `deadlineConflict()` com os negócios ativos, os trabalhos em andamento e os ocupados do Google do dono.
 * Usada no editor do pedido, no envio do link, no aceite manual, no detalhe do trabalho (W1), no
 * calendário e pelo Agente Opex. NUNCA recusa uma ação: só informa.
 */
export async function checkDeadlineConflict(access: AccessContext, raw: unknown): Promise<DeadlineConflictDto> {
    const input = deadlineConflictInputSchema.parse(raw)
    await dbConnect()
    await ensureBusinessCollections()
    let ownerId: string
    let own = true
    if (input.businessId) {
        // Quem edita pedidos/trabalhos vê o alerta mesmo sem o Calendário.
        const section = input.workId ? "works" : canUseModule(access, "orders") || canSupportBusinesses(access) ? "orders" : "calendar"
        const read = await readBusiness(access, input.businessId, section)
        ownerId = read.business.ownerId
        own = read.own
    } else {
        if (!["orders", "works", "calendar"].some((module) => canUseModule(access, module as "orders")) && !canSupportBusinesses(access)) throw denied("Seu perfil não permite verificar prazos.")
        ownerId = businessOwnerOf(access)
    }
    const timeZone = normalizeTimeZone(access.timeZone)
    const now = Date.now()
    let dueDate = input.dueDate ?? null
    let estimatedMinutes = input.estimatedMinutes
    let startKey: string | null = null
    let selfWorkId: string | null = null

    if (input.workId || input.orderId) {
        let work: WorkDoc | null = null
        let order: OrderDoc | null = null
        if (input.workId) {
            work = await workModels().works.findOne({ _id: input.workId, businessId: input.businessId }).lean<WorkDoc>()
            if (!work) throw new DomainError(404, "Trabalho não encontrado", "WORK_NOT_FOUND")
            order = await orderModels().orders.findOne({ _id: work.orderId }).lean<OrderDoc>()
        } else {
            order = await orderModels().orders.findOne({ _id: input.orderId, businessId: input.businessId }).lean<OrderDoc>()
            if (!order) throw new DomainError(404, "Pedido não encontrado", "ORDER_NOT_FOUND")
            if (order.workId) work = await workModels().works.findOne({ _id: order.workId }).lean<WorkDoc>()
        }
        if (work) {
            selfWorkId = work._id.toString()
            startKey = acceptanceKey(work, order ?? undefined, timeZone)
            if (input.dueDate === undefined) dueDate = work.dueDate ?? null
            if (estimatedMinutes === undefined) estimatedMinutes = Math.max(0, (work.estimatedMinutes ?? 0) - (work.loggedMinutes ?? 0))
        } else if (order) {
            if (input.dueDate === undefined) dueDate = order.dueDate ?? null
            if (estimatedMinutes === undefined) estimatedMinutes = totalMinutes(order.items ?? [])
        }
    }

    const scope = await loadOwnerScope(ownerId, timeZone)
    let busy: readonly (readonly [number, number])[] = []
    let googleError: string | null = null
    if (own && dueDate && (estimatedMinutes ?? 0) > 0) {
        const end = dayEnd(dueDate, timeZone)
        if (end > now) {
            const google = await readGoogleEvents(ownerId, now, end, timeZone)
            busy = google.busy
            googleError = google.error
        }
    }
    const result = deadlineConflict({ now, timeZone, dueDate, estimatedMinutes: estimatedMinutes ?? 0, startKey: startKey ?? dayKeyOf(now, timeZone), selfWorkId, works: conflictWorksOf(scope), availabilities: availabilitiesOf(scope), busy })
    const businessNames = Object.fromEntries(result.overlap.map((item) => [item.businessId, scope.businessById.get(item.businessId)?.name ?? "Negócio"]))
    return { ...result, businessNames, googleError }
}
