"use client"

import { useCallback } from "react"
import { AlertTriangle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { api, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { PublicPortfolioDto } from "../types"
import { PublicPortfolioView, useDocumentBusinessTheme, useFreshPortfolio } from "./PublicPortfolioView"

/** Página pública `/p/[slug]` (sem login), com o tema do negócio. */
export function PublicPortfolioPage({ initial, error }: { initial: PublicPortfolioDto | null; error: string | null }) {
    if (!initial) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
                <Card className="max-w-lg">
                    <CardContent className="space-y-2 pt-6 text-center">
                        <AlertTriangle className="mx-auto h-8 w-8 text-warning" aria-hidden />
                        <p className="font-semibold">Portfólio indisponível</p>
                        <p className="text-sm text-muted-foreground">{error ?? "Tente novamente em instantes."}</p>
                    </CardContent>
                </Card>
            </main>
        )
    }
    return <PublishedPortfolio initial={initial} />
}

function PublishedPortfolio({ initial }: { initial: PublicPortfolioDto }) {
    const refresh = useCallback(async () => unwrapApi((await api.get<ApiResponse<PublicPortfolioDto>>(`/public/portfolio/${initial.slug}`)).data), [initial.slug])
    const { data, open } = useFreshPortfolio(initial, refresh)
    useDocumentBusinessTheme(data.business.theme)
    return <PublicPortfolioView data={data} onOpenFile={(event, fileId, mode) => void open(event, fileId, mode)} />
}
