import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { createWorkColumn, getWorkBoard } from "@/features/works/server/columns"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/work-columns — quadro do negócio (fixas + customizadas, ordem e contagens). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getWorkBoard(currentAccess(), params.id)))

/** POST /api/businesses/[id]/work-columns — cria uma coluna customizada entre Abertura e Pago. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => ok(await createWorkColumn(currentAccess(), params.id, await req.json().catch(() => null))))
