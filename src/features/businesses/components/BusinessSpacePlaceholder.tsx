"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { InDevelopment } from "@/components/feedback/InDevelopment"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useBusiness } from "../hooks/useBusinesses"
import { BusinessAvatar } from "./BusinessAvatar"

/** `/negocios/[id]`: o espaço do negócio entra no M2; por enquanto, o aviso "Em desenvolvimento". */
export function BusinessSpacePlaceholder({ id }: { id: string }) {
    const query = useBusiness(id)
    if (query.isLoading) return <Skeleton className="h-32 w-full" />
    if (query.isError || !query.data) return <ErrorState title="Negócio não encontrado" description={apiErrorMessage(query.error, "Ele pode ter sido arquivado ou excluído.")} onRetry={() => void query.refetch()} />
    const business = query.data
    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
                <BusinessAvatar business={business} className="h-12 w-12" />
                <div>
                    <h1 className="text-lg font-semibold md:text-2xl">{business.name}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Espaço do negócio</p>
                </div>
            </div>
            <InDevelopment title="Espaço do negócio" dependency="Dashboard, ficha, metas, atividades, documentos, sucessos e a transcrição da entrevista chegam no próximo módulo." />
        </div>
    )
}
