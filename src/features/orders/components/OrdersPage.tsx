"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"
import { Briefcase, ChevronDown, CircleDot, Plus, ReceiptText, UserRound } from "lucide-react"
import { usePermissions } from "@nandobfer/perfix/react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { CadastroTableSkeleton } from "@/components/list/CadastroTableSkeleton"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { TableAction } from "@/components/list/TableAction"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { formatMoney } from "@/features/businesses/format"
import { useBusinesses } from "@/features/businesses/hooks/useBusinesses"
import { CELL_CLASS, ItemTable, matchesSearch, ROW_CLASS } from "@/features/businesses/components/space/item-ui"
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from "../constants"
import { formatMinutes } from "../logic"
import { useClients, useOrders } from "../hooks/useOrders"
import { dateKeyLabel, DeadlineBadge, OrderStatusPill } from "./OrderBadges"

export const orderHref = (businessId: string, orderId: string) => `/negocios/${businessId}/pedidos/${orderId}`
export const newOrderHref = (businessId: string) => `/negocios/${businessId}/pedidos/novo`

/**
 * Lista de pedidos: dentro do espaço do negócio (`businessId`) ou a visão global `/pedidos` (todos os
 * negócios, com o filtro por negócio). Busca por código, título e cliente; filtros por status e
 * cliente; selo de prazo ("Vence em X dias"/"Atrasado") nos abertos.
 */
export function OrdersPage({ businessId, editable = true }: { businessId?: string; editable?: boolean }) {
    const router = useRouter()
    const reduceMotion = useReducedMotion()
    const { can } = usePermissions()
    const query = useOrders({ businessId })
    const clients = useClients()
    const businesses = useBusinesses(!businessId)
    const [search, setSearch] = useState("")
    const [status, setStatus] = useState<OrderStatus[]>([])
    const [businessFilter, setBusinessFilter] = useState<string[]>([])
    const [clientFilter, setClientFilter] = useState<string[]>([])
    const canCreate = editable && can("businesses.use") && (query.data?.editable ?? false)
    const activeBusinesses = (businesses.data?.items ?? []).filter((business) => business.status === "active")

    const items = useMemo(
        () =>
            (query.data?.items ?? []).filter(
                (order) =>
                    (!status.length || status.includes(order.status)) &&
                    (!businessFilter.length || businessFilter.includes(order.businessId)) &&
                    (!clientFilter.length || clientFilter.includes(order.clientId)) &&
                    matchesSearch(search, order.code, order.displayTitle, order.clientName, order.businessName),
            ),
        [query.data, status, businessFilter, clientFilter, search],
    )
    const clear = () => {
        setSearch("")
        setStatus([])
        setBusinessFilter([])
        setClientFilter([])
    }

    const createButton = !canCreate ? null : businessId ? (
        <Button className="h-9 gap-2 px-4" onClick={() => router.push(newOrderHref(businessId))}>
            <Plus className="h-4 w-4" aria-hidden /> Novo pedido
        </Button>
    ) : activeBusinesses.length === 1 ? (
        <Button className="h-9 gap-2 px-4" onClick={() => router.push(newOrderHref(activeBusinesses[0]!.id))}>
            <Plus className="h-4 w-4" aria-hidden /> Novo pedido
        </Button>
    ) : activeBusinesses.length > 1 ? (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button className="h-9 gap-2 px-4">
                    <Plus className="h-4 w-4" aria-hidden /> Novo pedido <ChevronDown className="h-4 w-4" aria-hidden />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {activeBusinesses.map((business) => (
                    <DropdownMenuItem key={business.id} onSelect={() => router.push(newOrderHref(business.id))}>
                        {business.name}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    ) : null

    return (
        <>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <CadastroHeader title="Pedidos" description={businessId ? "Orçamentos do negócio: rascunhos, enviados e decididos" : "Orçamentos de todos os seus negócios"} />
                </div>
                {createButton}
            </div>
            <ListFilters total={items.length} search={{ value: search, onChange: setSearch, placeholder: "Buscar por código, título ou cliente", label: "Buscar pedidos" }} onClear={clear}>
                <FilterGroup label="Status" className="min-w-[180px] flex-1">
                    <CadastroMultiSelect aria-label="Status" icon={CircleDot} placeholder="Todos" selected={status} onSelect={(values) => setStatus(values as OrderStatus[])} options={ORDER_STATUSES.map((value) => ({ value, label: ORDER_STATUS_LABELS[value] }))} />
                </FilterGroup>
                {!businessId && (
                    <FilterGroup label="Negócio" className="min-w-[180px] flex-1">
                        <CadastroMultiSelect aria-label="Negócio" icon={Briefcase} placeholder="Todos" searchable selected={businessFilter} onSelect={setBusinessFilter} options={(businesses.data?.items ?? []).map((business) => ({ value: business.id, label: business.name }))} />
                    </FilterGroup>
                )}
                <FilterGroup label="Cliente" className="min-w-[180px] flex-1">
                    <CadastroMultiSelect aria-label="Cliente" icon={UserRound} placeholder="Todos" searchable selected={clientFilter} onSelect={setClientFilter} options={(clients.data?.items ?? []).map((client) => ({ value: client.id, label: client.name }))} />
                </FilterGroup>
            </ListFilters>
            {query.isPending ? (
                <CadastroTableSkeleton columns={businessId ? 6 : 7} rows={5} />
            ) : query.isError ? (
                <ErrorState title="Não foi possível carregar os pedidos" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : !items.length ? (
                <EmptyState
                    icon={ReceiptText}
                    title={query.data.items.length ? "Nenhum pedido encontrado." : "Nenhum pedido ainda."}
                    description={query.data.items.length ? undefined : "Todo trabalho nasce de um pedido aceito: registre a necessidade do cliente, as horas e envie o orçamento."}
                />
            ) : (
                <OrdersTable items={items} showBusiness={!businessId} reduceMotion={Boolean(reduceMotion)} />
            )}
        </>
    )
}

type OrderRow = NonNullable<ReturnType<typeof useOrders>["data"]>["items"][number]

/** Tabela de pedidos (também no detalhe do cliente). */
export function OrdersTable({ items, showBusiness, reduceMotion = false }: { items: OrderRow[]; showBusiness: boolean; reduceMotion?: boolean }) {
    const router = useRouter()
    const head = [
        { label: "Código", className: "w-28" },
        { label: "Pedido", className: "min-w-[200px]" },
        ...(showBusiness ? [{ label: "Negócio", className: "hidden lg:table-cell w-40" }] : []),
        { label: "Valor", className: "w-36" },
        { label: "Entrega", className: "w-40" },
        { label: "Status", className: "w-28" },
        { label: "Ações", className: "w-20 text-right" },
    ]
    return (
        <ItemTable label="Pedidos" head={head}>
            {items.map((order) => (
                <motion.tr key={order.id} initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} className={ROW_CLASS}>
                    <td className={`${CELL_CLASS} font-mono text-xs text-primary`}>
                        <Link href={orderHref(order.businessId, order.id)} className="hover:underline">
                            {order.code}
                        </Link>
                    </td>
                    <td className={`${CELL_CLASS} max-md:w-full`}>
                        <span className="block truncate font-medium" title={order.displayTitle}>
                            {order.displayTitle}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{order.clientName ?? "Cliente removido"}</span>
                    </td>
                    {showBusiness && <td className={`${CELL_CLASS} hidden truncate text-xs text-muted-foreground lg:table-cell`}>{order.businessName ?? "—"}</td>}
                    <td className={`${CELL_CLASS} font-mono text-sm`}>
                        {formatMoney(order.totalCents, order.currency)}
                        <span className="block text-xs text-muted-foreground">{formatMinutes(order.totalMinutes)} h</span>
                    </td>
                    <td className={`${CELL_CLASS} text-sm`}>
                        {dateKeyLabel(order.dueDate)}
                        <DeadlineBadge status={order.status} dueDate={order.dueDate} alertDays={order.deadlineAlertDays} className="mt-0.5 flex w-fit" />
                    </td>
                    <td className={CELL_CLASS}>
                        <OrderStatusPill status={order.status} />
                    </td>
                    <td className={`${CELL_CLASS} max-md:ml-auto`}>
                        <div className="flex justify-end">
                            <TableAction type="visualize" onClick={() => router.push(orderHref(order.businessId, order.id))} />
                        </div>
                    </td>
                </motion.tr>
            ))}
        </ItemTable>
    )
}
