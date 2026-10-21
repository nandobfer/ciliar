import { ok, created } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { createOrder, listBusinessOrders } from "@/features/orders/server/orders"
import { orderListQuerySchema } from "@/features/orders/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/orders?status=&clientId= — pedidos do negócio (dono; suporte auditado). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    const query = orderListQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    return ok(await listBusinessOrders(currentAccess(), params.id, { status: query.status, clientId: query.clientId }))
})

/** POST /api/businesses/[id]/orders — cria um rascunho (cliente existente ou novo inline; só o dono, negócio ativo). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => created(await createOrder(currentAccess(), params.id, await req.json().catch(() => null))))
