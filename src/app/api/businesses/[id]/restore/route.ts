import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { restoreBusiness } from "@/features/businesses/server/businesses"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/restore — restaura um arquivado (exige vaga; 409 `BUSINESS_LIMIT_REACHED`). */
export const POST = withRoute<{ id: string }>(async ({ params }) => ok(await restoreBusiness(currentAccess(), params.id)))
