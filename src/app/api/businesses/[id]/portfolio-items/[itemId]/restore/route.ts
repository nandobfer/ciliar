import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { restorePortfolioItem } from "@/features/portfolio/server/items"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/portfolio-items/[itemId]/restore — restaura um item arquivado. */
export const POST = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await restorePortfolioItem(currentAccess(), params.id, params.itemId)))
