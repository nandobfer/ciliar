import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { sendOrder } from "@/features/orders/server/orders"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/orders/[orderId]/send — envia/renova o link (validade, e-mail opcional ao cliente). */
export const POST = withRoute<{ id: string; orderId: string }>(async ({ req, params }) => ok(await sendOrder(currentAccess(), params.id, params.orderId, await req.json().catch(() => null))))
