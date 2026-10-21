import { ok } from "@/lib/api/responses"
import { parseBody } from "@/lib/api/route"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { orderTitleFeatureSchema } from "@/features/orders/schemas"
import { getOrderTitleSettings, saveOrderTitleSettings } from "@/features/orders/server/ai"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/order-title — configuração do agente "Título de pedidos" e se pode ser usado. */
export const GET = withRoute(async () => ok(await getOrderTitleSettings()))

/** PUT /api/ai/features/order-title — salva (confere provedor, modelo e variante no catálogo). */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, orderTitleFeatureSchema)
    if (!body.ok) return body.response
    return ok(await saveOrderTitleSettings(body.data, currentAccess().userId))
})
