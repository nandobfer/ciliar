import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { cancelOrder } from "@/features/orders/server/orders"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/orders/[orderId]/cancel — cancela (Rascunho/Enviado; revoga o link; final). */
export const POST = withRoute<{ id: string; orderId: string }>(async ({ req, params }) => ok(await cancelOrder(currentAccess(), params.id, params.orderId, await req.json().catch(() => null))))
