import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { removeWorkAttachment } from "@/features/works/server/works"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** DELETE /api/businesses/[id]/works/[workId]/attachments/[fileId] — remove um anexo do trabalho (e o objeto do storage). */
export const DELETE = withRoute<{ id: string; workId: string; fileId: string }>(async ({ params }) => ok(await removeWorkAttachment(currentAccess(), params.id, params.workId, params.fileId)))
