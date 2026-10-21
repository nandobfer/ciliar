import type { Metadata } from "next"
import { headers } from "next/headers"
import { DomainError } from "@/lib/api/route"
import { checkRateLimit } from "@/features/auth/server/rate-limit"
import { QUOTE_READ_LIMIT } from "@/features/orders/constants"
import { getPublicQuote } from "@/features/orders/server/public"
import { PublicQuotePage } from "@/features/orders/components/PublicQuotePage"
import type { PublicQuoteDto } from "@/features/orders/types"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Orçamento", robots: { index: false, follow: false }, referrer: "no-referrer" }

/** Link do orçamento (cliente, SEM login): autoriza só pelo token, restrito àquele pedido. */
export default async function OrcamentoPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    const list = await headers()
    let quote: PublicQuoteDto | null = null
    let error: string | null = null
    try {
        checkRateLimit(`quote:read:${list.get("cf-connecting-ip") ?? list.get("x-real-ip") ?? "?"}`, Date.now(), QUOTE_READ_LIMIT)
        quote = await getPublicQuote(token)
    } catch (caught) {
        error = caught instanceof DomainError ? caught.message : "Não foi possível abrir o orçamento. Tente novamente em instantes."
    }
    return <PublicQuotePage token={token} initial={quote} error={error} />
}
