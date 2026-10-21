import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { archiveGoal } from "@/features/businesses/server/goals"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/goals/[itemId]/archive — arquiva a meta atual; a anterior volta a valer (`{ archived, current }`). */
export const POST = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await archiveGoal(currentAccess(), params.id, params.itemId)))
