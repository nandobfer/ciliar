import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { deleteWorkNote, updateWorkNote } from "@/features/works/server/notes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH /api/businesses/[id]/works/[workId]/notes/[noteId] — edita a própria nota. */
export const PATCH = withRoute<{ id: string; workId: string; noteId: string }>(async ({ req, params }) => ok(await updateWorkNote(currentAccess(), params.id, params.workId, params.noteId, await req.json().catch(() => null))))

/** DELETE /api/businesses/[id]/works/[workId]/notes/[noteId] — exclui a própria nota. */
export const DELETE = withRoute<{ id: string; workId: string; noteId: string }>(async ({ params }) => ok(await deleteWorkNote(currentAccess(), params.id, params.workId, params.noteId)))
