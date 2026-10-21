import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { checkRateLimit } from "@/features/auth/server/rate-limit"
import { QUOTE_READ_LIMIT } from "@/features/orders/constants"
import { clientIp } from "@/features/orders/server/link"
import { getPublicQuote } from "@/features/orders/server/public"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/public/orders/[token] — link do orçamento, SEM login: autoriza só pelo token (limite por IP). */
export const GET = withRoute<{ token: string }>(async ({ req, params }) => {
    checkRateLimit(`quote:read:${clientIp(req) ?? "?"}`, Date.now(), QUOTE_READ_LIMIT)
    const response = ok(await getPublicQuote(params.token))
    response.headers.set("Cache-Control", "no-store")
    return response
})
