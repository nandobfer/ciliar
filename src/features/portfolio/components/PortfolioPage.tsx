"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useBusinessSpace } from "@/features/businesses/components/space/BusinessSpaceLayout"
import { usePortfolio } from "../hooks/usePortfolio"
import { PortfolioEditor } from "./editor/PortfolioEditor"

/** Portfólio do negócio (M5): o editor de blocos da página pública, com rascunho e publicação. */
export function PortfolioPage() {
    const { business } = useBusinessSpace()
    const query = usePortfolio(business.id)

    return (
        <>
            <CadastroHeader title="Portfólio" description="Monte a página pública do negócio arrastando blocos e conteúdos. Publique quando estiver pronta." />
            {query.isPending ? (
                <div className="flex gap-4">
                    <Skeleton className="hidden h-[560px] w-72 lg:block" />
                    <Skeleton className="h-[560px] flex-1" />
                </div>
            ) : query.isError ? (
                <ErrorState title="Não foi possível carregar o portfólio" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : (
                <PortfolioEditor portfolio={query.data} />
            )}
        </>
    )
}
