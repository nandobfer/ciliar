import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { addWorkNote } from "@/features/works/server/notes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/works/[workId]/notes — nota interna (autor = usuário real). */
export const POST = withRoute<{ id: string; workId: string }>(async ({ req, params }) => ok(await addWorkNote(currentAccess(), params.id, params.workId, await req.json().catch(() => null))))
