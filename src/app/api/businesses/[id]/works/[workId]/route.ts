import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { deleteWork, getWork, updateWork } from "@/features/works/server/works"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/works/[workId] — trabalho com itens, horas, notas, anexos, pagamento e movimentações. */
export const GET = withRoute<{ id: string; workId: string }>(async ({ params }) => ok(await getWork(currentAccess(), params.id, params.workId)))

/** PATCH /api/businesses/[id]/works/[workId] — itens, horas estimadas, valor e prazo (altera o pedido aceito com uma versão `work`, não publicada). */
export const PATCH = withRoute<{ id: string; workId: string }>(async ({ req, params }) => ok(await updateWork(currentAccess(), params.id, params.workId, await req.json().catch(() => null))))

/** DELETE /api/businesses/[id]/works/[workId] — exclusão definitiva de um arquivado (o pedido fica como registro). */
export const DELETE = withRoute<{ id: string; workId: string }>(async ({ params }) => ok(await deleteWork(currentAccess(), params.id, params.workId)))
