import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { deleteTimeEntry, updateTimeEntry } from "@/features/works/server/time"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH /api/businesses/[id]/works/[workId]/time-entries/[entryId] — edita um lançamento (`version` otimista). */
export const PATCH = withRoute<{ id: string; workId: string; entryId: string }>(async ({ req, params }) => ok(await updateTimeEntry(currentAccess(), params.id, params.workId, params.entryId, await req.json().catch(() => null))))

/** DELETE /api/businesses/[id]/works/[workId]/time-entries/[entryId] — exclui um lançamento. */
export const DELETE = withRoute<{ id: string; workId: string; entryId: string }>(async ({ params }) => ok(await deleteTimeEntry(currentAccess(), params.id, params.workId, params.entryId)))
