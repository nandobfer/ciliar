import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { restoreWork } from "@/features/works/server/works"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/works/[workId]/restore — restaura um arquivado (volta à coluna e ao faturamento). */
export const POST = withRoute<{ id: string; workId: string }>(async ({ params }) => ok(await restoreWork(currentAccess(), params.id, params.workId)))
