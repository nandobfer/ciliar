import { cache } from "react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { DomainError } from "@/lib/api/route"
import { appendBasePath, withBasePath } from "@/lib/base-path"
import { appOrigin } from "@/features/auth/server/origin"
import { checkRateLimit } from "@/features/auth/server/rate-limit"
import { PORTFOLIO_READ_LIMIT, portfolioPagePath } from "@/features/portfolio/constants"
import { getPublicPortfolio } from "@/features/portfolio/server/public"
import { PublicPortfolioPage } from "@/features/portfolio/components/PublicPortfolioPage"
import type { PublicPortfolioDto } from "@/features/portfolio/types"

export const dynamic = "force-dynamic"

type Loaded = { data: PublicPortfolioDto | null; error: string | null }

/** Carrega uma vez por requisição (metadados e página): limite por IP, 404 para desligado/arquivado/inexistente. */
const load = cache(async (slug: string): Promise<Loaded> => {
    const list = await headers()
    try {
        checkRateLimit(`portfolio:read:${list.get("cf-connecting-ip") ?? list.get("x-real-ip") ?? "?"}`, Date.now(), PORTFOLIO_READ_LIMIT)
        return { data: await getPublicPortfolio(slug), error: null }
    } catch (caught) {
        if (caught instanceof DomainError && caught.status === 404) notFound()
        return { data: null, error: caught instanceof DomainError ? caught.message : "Não foi possível abrir o portfólio. Tente novamente em instantes." }
    }
})

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params
    const { data } = await load(slug)
    if (!data) return { title: "Portfólio", robots: { index: false, follow: false } }
    const origin = appendBasePath(appOrigin())
    const logo = data.business.logoUrl ? `${appOrigin()}${withBasePath(data.business.logoUrl)}` : null
    const description = data.business.description ?? data.business.segment ?? `Portfólio de ${data.business.name}`
    return {
        metadataBase: new URL(origin),
        title: data.business.name,
        description,
        robots: data.indexable ? { index: true, follow: true } : { index: false, follow: false },
        alternates: { canonical: `${appOrigin()}${withBasePath(portfolioPagePath(data.slug))}` },
        ...(logo ? { icons: { icon: logo, apple: logo } } : {}),
        openGraph: {
            type: "website",
            title: data.business.name,
            description,
            url: `${appOrigin()}${withBasePath(portfolioPagePath(data.slug))}`,
            siteName: data.business.name,
            ...(logo ? { images: [{ url: logo, alt: `Logo de ${data.business.name}` }] } : {}),
        },
    }
}

/** Portfólio público do negócio (SEM login): só os campos da lista explícita do servidor. */
export default async function PortfolioPublicPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const { data, error } = await load(slug)
    return <PublicPortfolioPage initial={data} error={error} />
}
