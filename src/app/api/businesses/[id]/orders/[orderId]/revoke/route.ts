import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { revokeOrderLink } from "@/features/orders/server/orders"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/orders/[orderId]/revoke — revoga o link (volta a Rascunho). */
export const POST = withRoute<{ id: string; orderId: string }>(async ({ req, params }) => ok(await revokeOrderLink(currentAccess(), params.id, params.orderId, await req.json().catch(() => null))))
