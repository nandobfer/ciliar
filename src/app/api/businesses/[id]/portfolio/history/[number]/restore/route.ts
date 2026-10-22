import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { restorePortfolioPublication } from "@/features/portfolio/server/portfolio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/portfolio/history/[number]/restore — restaura uma publicação como rascunho. */
export const POST = withRoute<{ id: string; number: string }>(async ({ req, params }) => ok(await restorePortfolioPublication(currentAccess(), params.id, Number(params.number), await req.json().catch(() => null))))
