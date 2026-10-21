import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { orderLinkUrl } from "@/features/orders/server/orders"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/orders/[orderId]/link — URL do link para "Copiar link" (só o dono, enquanto válido). */
export const GET = withRoute<{ id: string; orderId: string }>(async ({ params }) => ok(await orderLinkUrl(currentAccess(), params.id, params.orderId)))
