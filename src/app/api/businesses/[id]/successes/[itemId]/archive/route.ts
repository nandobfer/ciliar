import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { archiveSuccess } from "@/features/businesses/server/successes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/successes/[itemId]/archive — arquiva (exclusão definitiva automática após o prazo do tipo). */
export const POST = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await archiveSuccess(currentAccess(), params.id, params.itemId)))
