import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { setPortfolioPublished } from "@/features/portfolio/server/portfolio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/portfolio/unpublish — despublica (a página pública responde 404) (`version` otimista). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => ok(await setPortfolioPublished(currentAccess(), params.id, false, await req.json().catch(() => null))))
