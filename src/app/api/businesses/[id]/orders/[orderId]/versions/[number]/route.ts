import { ok } from "@/lib/api/responses"
import { DomainError } from "@/lib/api/route"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { getOrder } from "@/features/orders/server/orders"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Versão imutável (dono ou suporte auditado), inclusive as não publicadas. */
export const GET = withRoute<{ id: string; orderId: string; number: string }>(async ({ params }) => {
    const order = await getOrder(currentAccess(), params.id, params.orderId)
    const version = /^\d+$/.test(params.number) ? order.versions.find((entry) => entry.number === Number(params.number)) : null
    if (!version) throw new DomainError(404, "Versão não encontrada", "ORDER_VERSION_NOT_FOUND")
    return ok(version)
})
