import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { restoreActivity } from "@/features/businesses/server/activities"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/activities/[itemId]/restore — restaura. */
export const POST = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await restoreActivity(currentAccess(), params.id, params.itemId)))
