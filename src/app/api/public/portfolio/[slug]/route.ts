import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { checkRateLimit } from "@/features/auth/server/rate-limit"
import { clientIp } from "@/features/orders/server/link"
import { PORTFOLIO_READ_LIMIT } from "@/features/portfolio/constants"
import { getPublicPortfolio } from "@/features/portfolio/server/public"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/public/portfolio/[slug] — portfólio publicado, SEM login (limite por IP); relido quando as URLs assinadas vencem. */
export const GET = withRoute<{ slug: string }>(async ({ req, params }) => {
    checkRateLimit(`portfolio:read:${clientIp(req) ?? "?"}`, Date.now(), PORTFOLIO_READ_LIMIT)
    const response = ok(await getPublicPortfolio(params.slug))
    response.headers.set("Cache-Control", "no-store")
    return response
})
