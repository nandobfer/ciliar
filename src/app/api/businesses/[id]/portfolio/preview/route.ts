import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { getPortfolioPreview } from "@/features/portfolio/server/public"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/portfolio/preview — o que o visitante veria (mesmo despublicado). */
export const GET = withRoute<{ id: string }>(async ({ params }) => {
    const response = ok(await getPortfolioPreview(currentAccess(), params.id))
    response.headers.set("Cache-Control", "no-store")
    return response
})
