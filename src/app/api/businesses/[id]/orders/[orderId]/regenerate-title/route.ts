import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { regenerateOrderTitle } from "@/features/orders/server/orders"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/orders/[orderId]/regenerate-title — gera de novo o título/resumo por IA. */
export const POST = withRoute<{ id: string; orderId: string }>(async ({ params }) => ok(await regenerateOrderTitle(currentAccess(), params.id, params.orderId)))
