import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { assertMutationOrigin } from "@/features/auth/server/origin"
import { checkRateLimit } from "@/features/auth/server/rate-limit"
import { QUOTE_DECISION_LIMIT } from "@/features/orders/constants"
import { clientIp, hashQuoteToken } from "@/features/orders/server/link"
import { decideQuote } from "@/features/orders/server/public"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/public/orders/[token]/reject — recusa pelo cliente (motivo opcional; data/hora e IP). */
export const POST = withRoute<{ token: string }>(async ({ req, params }) => {
    assertMutationOrigin(req)
    const ip = clientIp(req)
    checkRateLimit(`quote:decide:${ip ?? "?"}`, Date.now(), QUOTE_DECISION_LIMIT)
    checkRateLimit(`quote:decide-token:${ip ?? "?"}:${hashQuoteToken(params.token)}`, Date.now(), QUOTE_DECISION_LIMIT)
    const response = ok(await decideQuote(params.token, "reject", await req.json().catch(() => null), ip))
    response.headers.set("Cache-Control", "no-store")
    return response
})
