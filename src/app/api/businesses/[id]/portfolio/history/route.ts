import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { listPortfolioPublications } from "@/features/portfolio/server/portfolio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/portfolio/history — últimas publicações. */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await listPortfolioPublications(currentAccess(), params.id)))
