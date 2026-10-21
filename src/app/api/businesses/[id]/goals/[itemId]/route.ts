import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { getGoal, updateGoal, deleteGoal } from "@/features/businesses/server/goals"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/goals/[itemId] — meta. */
export const GET = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await getGoal(currentAccess(), params.id, params.itemId)))

/** PATCH /api/businesses/[id]/goals/[itemId] — edita a meta atual criando uma nova versão (devolve a nova; `version` otimista). */
export const PATCH = withRoute<{ id: string; itemId: string }>(async ({ req, params }) => ok(await updateGoal(currentAccess(), params.id, params.itemId, await req.json().catch(() => null))))

/** DELETE /api/businesses/[id]/goals/[itemId] — exclusão definitiva de um item arquivado (irreversível). */
export const DELETE = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await deleteGoal(currentAccess(), params.id, params.itemId)))
