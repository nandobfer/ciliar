import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { markWorkPaid } from "@/features/works/server/works"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/works/[workId]/payment — registra o pagamento (entra em Pago) ou corrige o de um trabalho pago. */
export const POST = withRoute<{ id: string; workId: string }>(async ({ req, params }) => ok(await markWorkPaid(currentAccess(), params.id, params.workId, await req.json().catch(() => null))))
