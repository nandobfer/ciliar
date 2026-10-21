"use client"

import { useAppSession } from "@/features/access/components/AccessProvider"
import { useOrdersRealtime } from "../hooks/useOrders"

/** Montado na casca: invalida clientes/pedidos e avisa (toast) quando o cliente decide pelo link. */
export function OrdersRealtime() {
    const { session } = useAppSession()
    useOrdersRealtime(session?.user.id ?? null, !session?.access.simulation)
    return null
}
