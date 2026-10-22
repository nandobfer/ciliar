import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { publishPortfolioChanges } from "@/features/portfolio/server/portfolio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/portfolio/publish-changes — o rascunho vira a página publicada (`publishPage` também liga a página). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => ok(await publishPortfolioChanges(currentAccess(), params.id, await req.json().catch(() => null))))
