import { ok, created } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { listGoals, createGoal } from "@/features/businesses/server/goals"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/goals — a meta atual e a linha do tempo (dono; suporte com `businesses.view_all`, auditado). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await listGoals(currentAccess(), params.id)))

/** POST /api/businesses/[id]/goals — cria a meta atual (a anterior vai para o histórico; só o dono, negócio ativo). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => created(await createGoal(currentAccess(), params.id, await req.json().catch(() => null))))
