import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { archivePortfolioItem } from "@/features/portfolio/server/items"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/portfolio-items/[itemId]/archive — arquiva (exclusão definitiva automática após o prazo dos itens avulsos). */
export const POST = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await archivePortfolioItem(currentAccess(), params.id, params.itemId)))
