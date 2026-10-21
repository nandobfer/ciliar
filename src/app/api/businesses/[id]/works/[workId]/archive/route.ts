import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { archiveWork } from "@/features/works/server/works"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/works/[workId]/archive — arquiva (em Pago, sai do faturamento enquanto arquivado). */
export const POST = withRoute<{ id: string; workId: string }>(async ({ params }) => ok(await archiveWork(currentAccess(), params.id, params.workId)))
