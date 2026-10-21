import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { listOrders } from "@/features/orders/server/orders"
import { orderListQuerySchema } from "@/features/orders/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/orders?businessId=&clientId=&status= — visão global dos pedidos de todos os negócios do dono efetivo. */
export const GET = withRoute(async ({ req }) => ok(await listOrders(currentAccess(), orderListQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams)))))
