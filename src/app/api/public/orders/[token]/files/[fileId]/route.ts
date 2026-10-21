import { withRoute } from "@/lib/api/route"
import { checkRateLimit } from "@/features/auth/server/rate-limit"
import { QUOTE_READ_LIMIT } from "@/features/orders/constants"
import { clientIp } from "@/features/orders/server/link"
import { publicQuoteFile } from "@/features/orders/server/public"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/public/orders/[token]/files/[fileId]?download=1 — anexo visível ao cliente. */
export const GET = withRoute<{ token: string; fileId: string }>(async ({ req, params }) => {
    checkRateLimit(`quote:read:${clientIp(req) ?? "?"}`, Date.now(), QUOTE_READ_LIMIT)
    return publicQuoteFile(params.token, params.fileId, { download: req.nextUrl.searchParams.get("download") === "1" })
})
