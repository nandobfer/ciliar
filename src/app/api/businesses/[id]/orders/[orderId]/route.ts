import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { getOrder, updateOrder } from "@/features/orders/server/orders"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/orders/[orderId] — pedido com itens, anexos, versões e decisões. */
export const GET = withRoute<{ id: string; orderId: string }>(async ({ params }) => ok(await getOrder(currentAccess(), params.id, params.orderId)))

/** PATCH /api/businesses/[id]/orders/[orderId] — edita (rascunho/enviado; `version` otimista; depois do 1º envio gera versão). */
export const PATCH = withRoute<{ id: string; orderId: string }>(async ({ req, params }) => ok(await updateOrder(currentAccess(), params.id, params.orderId, await req.json().catch(() => null))))
