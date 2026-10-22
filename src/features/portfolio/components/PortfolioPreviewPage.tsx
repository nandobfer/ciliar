"use client"

import { useCallback } from "react"
import Link from "next/link"
import { AlertTriangle, Eye } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { apiErrorMessage } from "@/lib/api"
import { businessSpaceHref } from "@/features/businesses/constants"
import { usePortfolioPreview } from "../hooks/usePortfolio"
import type { PublicPortfolioDto } from "../types"
import { PublicPortfolioView, useDocumentBusinessTheme, useFreshPortfolio } from "./PublicPortfolioView"

/** Pré-visualização do portfólio como o visitante (com sessão, mesmo despublicado). */
export function PortfolioPreviewPage({ businessId }: { businessId: string }) {
    const query = usePortfolioPreview(businessId)
    if (query.isPending) {
        return (
            <main className="mx-auto max-w-5xl space-y-4 px-4 py-12">
                <Skeleton className="h-20" />
                <Skeleton className="h-60" />
            </main>
        )
    }
    if (query.isError) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
                <Card className="max-w-lg">
                    <CardContent className="space-y-2 pt-6 text-center">
                        <AlertTriangle className="mx-auto h-8 w-8 text-warning" aria-hidden />
                        <p className="font-semibold">Não foi possível abrir a pré-visualização</p>
                        <p className="text-sm text-muted-foreground">{apiErrorMessage(query.error, "Entre na sua conta e tente novamente.")}</p>
                    </CardContent>
                </Card>
            </main>
        )
    }
    return <Preview businessId={businessId} initial={query.data} refetch={async () => (await query.refetch()).data ?? null} />
}

function Preview({ businessId, initial, refetch }: { businessId: string; initial: PublicPortfolioDto & { published: boolean }; refetch: () => Promise<PublicPortfolioDto | null> }) {
    const refresh = useCallback(() => refetch(), [refetch])
    const { data, open } = useFreshPortfolio(initial, refresh)
    useDocumentBusinessTheme(data.business.theme)
    return (
        <PublicPortfolioView
            data={data}
            onOpenFile={(event, fileId, mode) => void open(event, fileId, mode)}
            banner={
                <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
                    <span className="inline-flex items-center gap-2">
                        <Eye className="h-4 w-4 text-primary" aria-hidden />
                        Pré-visualização: é assim que o visitante verá a página. {initial.published ? "O portfólio está publicado." : "O portfólio ainda não está publicado."}
                    </span>
                    <Link href={businessSpaceHref(businessId, "portfolio")} className="font-medium text-primary hover:underline">
                        Voltar ao portfólio
                    </Link>
                </div>
            }
        />
    )
}
