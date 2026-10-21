import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { createTimeEntry, listTimeEntries } from "@/features/works/server/time"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/works/[workId]/time-entries — lançamentos de horas. */
export const GET = withRoute<{ id: string; workId: string }>(async ({ params }) => ok(await listTimeEntries(currentAccess(), params.id, params.workId)))

/** POST /api/businesses/[id]/works/[workId]/time-entries — lança horas (item do pedido ou atividade; valor/hora congelado). */
export const POST = withRoute<{ id: string; workId: string }>(async ({ req, params }) => ok(await createTimeEntry(currentAccess(), params.id, params.workId, await req.json().catch(() => null))))
