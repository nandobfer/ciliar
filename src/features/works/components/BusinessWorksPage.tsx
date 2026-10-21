"use client"

import { useBusinessSpace } from "@/features/businesses/components/space/BusinessSpaceLayout"
import { WorksPage } from "./WorksPage"

/** Trabalhos dentro do espaço do negócio (negócio arquivado ou suporte: somente leitura). */
export function BusinessWorksPage() {
    const { business, editable } = useBusinessSpace()
    return <WorksPage businessId={business.id} editable={editable} />
}
