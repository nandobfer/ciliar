import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { archiveDocument } from "@/features/businesses/server/documents"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/documents/[itemId]/archive — arquiva (exclusão definitiva automática após o prazo do tipo). */
export const POST = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await archiveDocument(currentAccess(), params.id, params.itemId)))
