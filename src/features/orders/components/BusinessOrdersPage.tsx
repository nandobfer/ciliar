"use client"

import { useBusinessSpace } from "@/features/businesses/components/space/BusinessSpaceLayout"
import { OrdersPage } from "./OrdersPage"

/** Pedidos dentro do espaço do negócio (negócio arquivado ou suporte: somente leitura). */
export function BusinessOrdersPage() {
    const { business, editable } = useBusinessSpace()
    return <OrdersPage businessId={business.id} editable={editable} />
}
