import type { Metadata } from "next"
import { PortfolioPreviewPage } from "@/features/portfolio/components/PortfolioPreviewPage"

export const metadata: Metadata = { title: "Pré-visualização do portfólio", robots: { index: false, follow: false }, referrer: "no-referrer" }

/** Pré-visualização do portfólio como o visitante (fora da casca do app; a API confere a sessão). */
export default async function PortfolioPreviewRoute({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return <PortfolioPreviewPage businessId={id} />
}
