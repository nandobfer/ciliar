import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { addWorkAttachments } from "@/features/works/server/works"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/works/[workId]/attachments — vincula arquivos enviados (`purpose: work`) como entregáveis. */
export const POST = withRoute<{ id: string; workId: string }>(async ({ req, params }) => ok(await addWorkAttachments(currentAccess(), params.id, params.workId, await req.json().catch(() => null))))
