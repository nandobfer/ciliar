import { withRoute } from "@/lib/api/route"
import { checkRateLimit } from "@/features/auth/server/rate-limit"
import { QUOTE_READ_LIMIT } from "@/features/orders/constants"
import { clientIp } from "@/features/orders/server/link"
import { publicQuoteLogo } from "@/features/orders/server/public"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/public/orders/[token]/logo — logo do negócio no link do orçamento. */
export const GET = withRoute<{ token: string }>(async ({ req, params }) => {
    checkRateLimit(`quote:read:${clientIp(req) ?? "?"}`, Date.now(), QUOTE_READ_LIMIT)
    return publicQuoteLogo(params.token)
})
