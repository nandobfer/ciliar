import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { restoreGoal } from "@/features/businesses/server/goals"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/goals/[itemId]/restore — restaura a meta arquivada como a atual (a atual vai para o histórico). */
export const POST = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await restoreGoal(currentAccess(), params.id, params.itemId)))
