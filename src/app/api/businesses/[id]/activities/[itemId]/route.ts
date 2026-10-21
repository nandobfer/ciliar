import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { getActivity, updateActivity, deleteActivity } from "@/features/businesses/server/activities"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/activities/[itemId] — atividade. */
export const GET = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await getActivity(currentAccess(), params.id, params.itemId)))

/** PATCH /api/businesses/[id]/activities/[itemId] — edita (atividade ativo; `version` otimista). */
export const PATCH = withRoute<{ id: string; itemId: string }>(async ({ req, params }) => ok(await updateActivity(currentAccess(), params.id, params.itemId, await req.json().catch(() => null))))

/** DELETE /api/businesses/[id]/activities/[itemId] — exclusão definitiva de um item arquivado (irreversível). */
export const DELETE = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await deleteActivity(currentAccess(), params.id, params.itemId)))
