import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { setPortfolioPublished } from "@/features/portfolio/server/portfolio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/portfolio/publish — publica a página /p/[slug] (`version` otimista). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => ok(await setPortfolioPublished(currentAccess(), params.id, true, await req.json().catch(() => null))))
