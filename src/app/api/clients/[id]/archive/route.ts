import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { archiveClient } from "@/features/orders/server/clients"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/clients/[id]/archive — arquiva (exclusão definitiva automática após o prazo de clientes, exceto com pedidos). */
export const POST = withRoute<{ id: string }>(async ({ params }) => ok(await archiveClient(currentAccess(), params.id)))
