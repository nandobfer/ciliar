"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Eye, Mail, Pencil, Phone, ReceiptText } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { formatMoney } from "@/features/businesses/format"
import { ArchivedNote } from "@/features/businesses/components/space/item-ui"
import { CLIENTS_PATH } from "../constants"
import { useClient } from "../hooks/useOrders"
import { ClientDialog, useClientRowActions } from "./ClientsPage"
import { OrdersTable } from "./OrdersPage"

/** Detalhe do cliente: contatos, observações privadas, totais por moeda e os pedidos de todos os negócios. */
export function ClientDetailPage({ id }: { id: string }) {
    const query = useClient(id)
    const [editing, setEditing] = useState(false)
    const rows = useClientRowActions()

    if (query.isPending) return <Skeleton className="h-96 w-full" />
    if (query.isError || !query.data) return <ErrorState title="Cliente não encontrado" description={apiErrorMessage(query.error, "Ele pode ter sido excluído, ou você não tem acesso a ele.")} onRetry={() => void query.refetch()} />
    const client = query.data

    return (
        <div className="flex flex-col gap-6">
            <header className="space-y-3">
                <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
                    <Link href={CLIENTS_PATH}>
                        <ArrowLeft className="h-4 w-4" aria-hidden /> Clientes
                    </Link>
                </Button>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="truncate text-lg font-semibold md:text-2xl">{client.name}</h1>
                        <ArchivedNote item={client} />
                    </div>
                    <div className="flex items-center gap-2">
                        {client.editable && client.status === "active" && (
                            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
                                <Pencil className="h-4 w-4" aria-hidden /> Editar
                            </Button>
                        )}
                        {rows.actions(client, { editable: client.editable })}
                    </div>
                </div>
            </header>
            {!client.own && (
                <Alert>
                    <Eye className="h-4 w-4" aria-hidden />
                    <AlertTitle>Somente leitura</AlertTitle>
                    <AlertDescription>Cliente de outro usuário, aberto pelo suporte (businesses.view_all). O acesso fica registrado na auditoria.</AlertDescription>
                </Alert>
            )}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Contato</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <p className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" aria-hidden /> {client.email ?? <span className="text-muted-foreground">Sem e-mail</span>}
                        </p>
                        <p className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" aria-hidden /> {client.phone ?? <span className="text-muted-foreground">Sem telefone</span>}
                        </p>
                        {client.notes && (
                            <div className="rounded-md border bg-muted/30 p-3">
                                <p className="text-xs font-semibold text-muted-foreground">Observações (privadas)</p>
                                <p className="mt-1 whitespace-pre-wrap">{client.notes}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Totais por moeda</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {client.totals.length ? (
                            <ul className="divide-y rounded-md border text-sm">
                                {client.totals.map((total) => (
                                    <li key={total.currency} className="grid grid-cols-3 gap-2 px-3 py-2">
                                        <span className="font-medium">
                                            {total.currency} <span className="text-xs text-muted-foreground">· {total.orders} pedido(s)</span>
                                        </span>
                                        <span>
                                            <span className="block text-xs text-muted-foreground">Aceitos</span>
                                            <span className="font-mono">{formatMoney(total.acceptedCents, total.currency)}</span>
                                        </span>
                                        <span>
                                            <span className="block text-xs text-muted-foreground">Em aberto</span>
                                            <span className="font-mono">{formatMoney(total.openCents, total.currency)}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-muted-foreground">Sem pedidos ainda.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
            <section className="space-y-3">
                <h2 className="text-base font-semibold">Pedidos de todos os negócios</h2>
                {client.orders.length ? <OrdersTable items={client.orders} showBusiness /> : <EmptyState icon={ReceiptText} title="Nenhum pedido para este cliente." />}
            </section>
            {editing && <ClientDialog client={client} onClose={() => setEditing(false)} />}
            {rows.dialog}
        </div>
    )
}
