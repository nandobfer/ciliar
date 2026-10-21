import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { getSuccess, updateSuccess, deleteSuccess } from "@/features/businesses/server/successes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/successes/[itemId] — sucesso. */
export const GET = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await getSuccess(currentAccess(), params.id, params.itemId)))

/** PATCH /api/businesses/[id]/successes/[itemId] — edita (sucesso ativo; `version` otimista). */
export const PATCH = withRoute<{ id: string; itemId: string }>(async ({ req, params }) => ok(await updateSuccess(currentAccess(), params.id, params.itemId, await req.json().catch(() => null))))

/** DELETE /api/businesses/[id]/successes/[itemId] — exclusão definitiva de um item arquivado (irreversível). */
export const DELETE = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await deleteSuccess(currentAccess(), params.id, params.itemId)))
