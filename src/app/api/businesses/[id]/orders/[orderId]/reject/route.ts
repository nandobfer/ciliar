import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { rejectOrder } from "@/features/orders/server/orders"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/orders/[orderId]/reject — recusa manual pelo prestador (motivo opcional). */
export const POST = withRoute<{ id: string; orderId: string }>(async ({ req, params }) => ok(await rejectOrder(currentAccess(), params.id, params.orderId, await req.json().catch(() => null))))
