import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { listBusinessWorks } from "@/features/works/server/works"
import { workListQuerySchema } from "@/features/works/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/works?status=&clientId= — trabalhos do negócio (Kanban/Tabela). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => ok(await listBusinessWorks(currentAccess(), params.id, workListQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams)))))
