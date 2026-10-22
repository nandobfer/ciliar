import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { applyPortfolioTemplate } from "@/features/portfolio/server/portfolio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/portfolio/template — aplica um modelo pronto ao rascunho (substitui os blocos). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => ok(await applyPortfolioTemplate(currentAccess(), params.id, await req.json().catch(() => null))))
