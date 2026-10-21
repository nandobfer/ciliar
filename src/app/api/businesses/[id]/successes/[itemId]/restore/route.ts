import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { restoreSuccess } from "@/features/businesses/server/successes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/successes/[itemId]/restore — restaura. */
export const POST = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await restoreSuccess(currentAccess(), params.id, params.itemId)))
