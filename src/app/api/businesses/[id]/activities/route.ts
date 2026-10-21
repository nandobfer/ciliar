import { ok, created } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { listActivities, createActivity } from "@/features/businesses/server/activities"
import { itemStatusQuerySchema } from "@/features/businesses/space-schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/activities?status= — lista (dono; suporte com `businesses.view_all`, auditado). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => ok(await listActivities(currentAccess(), params.id, itemStatusQuerySchema.parse(req.nextUrl.searchParams.get("status") ?? "all"))))

/** POST /api/businesses/[id]/activities — cria (atividade; só o dono, negócio ativo). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => created(await createActivity(currentAccess(), params.id, await req.json().catch(() => null))))
