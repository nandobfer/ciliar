import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { portfolioTagSuggestions } from "@/features/portfolio/server/items"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/portfolio-items/tags — categorias/tags já usadas no negócio. */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await portfolioTagSuggestions(currentAccess(), params.id)))
