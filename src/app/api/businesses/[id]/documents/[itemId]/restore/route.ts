import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { restoreDocument } from "@/features/businesses/server/documents"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/documents/[itemId]/restore — restaura. */
export const POST = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await restoreDocument(currentAccess(), params.id, params.itemId)))
