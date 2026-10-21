import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { restoreClient } from "@/features/orders/server/clients"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/clients/[id]/restore — restaura um arquivado. */
export const POST = withRoute<{ id: string }>(async ({ params }) => ok(await restoreClient(currentAccess(), params.id)))
