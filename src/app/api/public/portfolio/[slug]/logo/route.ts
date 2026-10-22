import { withRoute } from "@/lib/api/route"
import { checkRateLimit } from "@/features/auth/server/rate-limit"
import { clientIp } from "@/features/orders/server/link"
import { PORTFOLIO_READ_LIMIT } from "@/features/portfolio/constants"
import { publicPortfolioLogo } from "@/features/portfolio/server/public"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/public/portfolio/[slug]/logo — logo do negócio (favicon e Open Graph do portfólio publicado). */
export const GET = withRoute<{ slug: string }>(async ({ req, params }) => {
    checkRateLimit(`portfolio:read:${clientIp(req) ?? "?"}`, Date.now(), PORTFOLIO_READ_LIMIT)
    return publicPortfolioLogo(params.slug)
})
