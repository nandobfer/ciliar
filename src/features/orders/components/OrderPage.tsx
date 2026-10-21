"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowLeft, Ban, Check, Copy, History, Link2, Link2Off, Loader2, RotateCcw, Send, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DatePicker } from "@/components/ui/date-picker"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { browserTimeZone, todayKeyIn } from "@/lib/timezone"
import { businessSpaceHref } from "@/features/businesses/constants"
import { useBusinessSpace } from "@/features/businesses/components/space/BusinessSpaceLayout"
import { ORDER_REJECT_REASON_MAX, ORDER_VERSION_REASON_LABELS } from "../constants"
import { describeOrderChange } from "../history"
import { addDaysToKey } from "../logic"
import type { OrderDto } from "../types"
import { useClients, useCopyOrderLink, useOrder, useOrderAction, useSaveOrder, useSendOrder, type OrderStatusAction } from "../hooks/useOrders"
import { dateKeyLabel, DeadlineBadge, OrderStatusPill } from "./OrderBadges"
import { OrderForm } from "./OrderForm"
import { orderHref } from "./OrdersPage"

/** Novo pedido (`/negocios/[id]/pedidos/novo`). */
export function NewOrderPage() {
    const router = useRouter()
    const { business, editable } = useBusinessSpace()
    const save = useSaveOrder(business.id)
    const back = businessSpaceHref(business.id, "pedidos")
    if (!editable) return <ErrorState title="Somente leitura" description="Este negócio não aceita novos pedidos agora (arquivado ou aberto pelo suporte)." />
    return (
        <section className="space-y-6">
            <PageHeader back={back} title="Novo pedido" subtitle={`Rascunho em ${business.currency}: envie quando estiver pronto.`} />
            <OrderForm
                business={business}
                order={null}
                readOnly={false}
                pending={save.isPending}
                onCancel={() => router.push(back)}
                onSubmit={async (data) => {
                    const order = await save.mutateAsync({ data }).catch(() => null)
                    if (order) router.replace(orderHref(business.id, order.id))
                    return Boolean(order)
                }}
            />
        </section>
    )
}

function PageHeader({ back, title, subtitle, children }: { back: string; title: string; subtitle?: string; children?: React.ReactNode }) {
    return (
        <header className="space-y-3">
            <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
                <Link href={back} scroll={false}>
                    <ArrowLeft className="h-4 w-4" aria-hidden /> Pedidos
                </Link>
            </Button>
            <div>
                <h1 className="text-lg font-semibold md:text-2xl">{title}</h1>
                {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
                {children}
            </div>
        </header>
    )
}

/** Pedido (`/negocios/[id]/pedidos/[orderId]`): formulário + status, link, decisão e versões. */
export function OrderDetailPage({ orderId }: { orderId: string }) {
    const { business } = useBusinessSpace()
    const query = useOrder(business.id, orderId)
    const save = useSaveOrder(business.id)
    const back = businessSpaceHref(business.id, "pedidos")

    if (query.isPending) return <Skeleton className="h-96 w-full" />
    if (query.isError || !query.data) return <ErrorState title="Pedido não encontrado" description={apiErrorMessage(query.error, "Ele pode ter sido excluído com o negócio, ou você não tem acesso a ele.")} onRetry={() => void query.refetch()} />
    const order = query.data

    return (
        <section className="space-y-6">
            <PageHeader back={back} title={`${order.code} · ${order.displayTitle}`}>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <OrderStatusPill status={order.status} />
                    <DeadlineBadge status={order.status} dueDate={order.dueDate} alertDays={order.deadlineAlertDays} />
                    {order.status === "accepted" && <span className="text-xs text-muted-foreground">Versão aceita guardada como registro; itens, horas e valor seguem no trabalho (M4).</span>}
                </div>
            </PageHeader>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <OrderForm
                    business={business}
                    order={order}
                    readOnly={!order.editable}
                    pending={save.isPending}
                    onCancel={() => undefined}
                    onSubmit={async (data) => Boolean(await save.mutateAsync({ id: order.id, data }).catch(() => null))}
                />
                <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
                    <OrderActionsCard order={order} />
                    <OrderDecisionCard order={order} />
                    <OrderVersionsCard order={order} />
                </aside>
            </div>
        </section>
    )
}

type Confirm = { action: Exclude<OrderStatusAction, "reject">; title: string; description: string; destructive?: boolean; label: string } | null

const CONFIRMS: Record<Exclude<OrderStatusAction, "reject">, Omit<NonNullable<Confirm>, "action">> = {
    revoke: { title: "Revogar o link?", description: "O cliente perde o acesso ao orçamento e o pedido volta a Rascunho. Um novo envio gera outro link.", label: "Revogar link", destructive: true },
    accept: { title: "Registrar o aceite?", description: "Use quando o cliente aceitou fora do link. A versão atual fica guardada como registro, o pedido fica somente leitura e o trabalho é criado na coluna Abertura.", label: "Registrar aceite" },
    reopen: { title: "Reabrir o pedido?", description: "O pedido volta a Rascunho como nova versão; a recusa fica no histórico. Envie de novo para o cliente ver.", label: "Reabrir" },
    cancel: { title: "Cancelar o pedido?", description: "Desistência antes da decisão: o link é revogado e o pedido fica Cancelado (estado final).", label: "Cancelar pedido", destructive: true },
}

function OrderActionsCard({ order }: { order: OrderDto }) {
    const { editable: spaceEditable } = useBusinessSpace()
    const action = useOrderAction(order.businessId, order.id)
    const copy = useCopyOrderLink(order.businessId, order.id)
    const [sending, setSending] = useState(false)
    const [rejecting, setRejecting] = useState(false)
    const [confirm, setConfirm] = useState<Confirm>(null)
    const can = (name: string) => order.actions.includes(name as never)
    const linkUsable = Boolean(order.link) && !(order.status === "sent" && order.link?.expired)

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Orçamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                {order.link ? (
                    <div className="space-y-1 rounded-md border bg-muted/20 p-3">
                        <p className="flex items-center gap-1.5 font-medium">
                            {order.link.expired && order.status === "sent" ? <Link2Off className="h-4 w-4 text-destructive" aria-hidden /> : <Link2 className="h-4 w-4 text-primary" aria-hidden />}
                            {order.link.expired && order.status === "sent" ? "Link expirado" : "Link ativo"}
                        </p>
                        <p className="text-xs text-muted-foreground">Válido até {dateKeyLabel(order.link.validUntil)}</p>
                        <p className="text-xs text-muted-foreground">Enviado em {format(new Date(order.link.sentAt), "dd/MM/yyyy HH:mm")}</p>
                        {order.link.emailedAt && <p className="text-xs text-muted-foreground">E-mail em {format(new Date(order.link.emailedAt), "dd/MM/yyyy HH:mm")}</p>}
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground">{order.status === "draft" ? "Rascunho sem link: envie para gerar o link do cliente." : "Sem link ativo."}</p>
                )}
                <div className="flex flex-col gap-2">
                    {can("send") && (
                        <Button className="gap-1.5" onClick={() => setSending(true)}>
                            <Send className="h-4 w-4" aria-hidden /> {order.status === "draft" ? "Enviar orçamento" : order.link?.expired ? "Reenviar (novo link)" : "Prorrogar / reenviar"}
                        </Button>
                    )}
                    {linkUsable && spaceEditable && (
                        <Button variant="outline" className="gap-1.5" disabled={copy.isPending} onClick={() => copy.mutate()}>
                            {copy.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} Copiar link
                        </Button>
                    )}
                    {can("accept") && (
                        <Button variant="outline" className="gap-1.5" onClick={() => setConfirm({ action: "accept", ...CONFIRMS.accept })}>
                            <Check className="h-4 w-4" aria-hidden /> Registrar aceite
                        </Button>
                    )}
                    {can("reject") && (
                        <Button variant="outline" className="gap-1.5" onClick={() => setRejecting(true)}>
                            <X className="h-4 w-4" aria-hidden /> Registrar recusa
                        </Button>
                    )}
                    {can("reopen") && (
                        <Button variant="outline" className="gap-1.5" onClick={() => setConfirm({ action: "reopen", ...CONFIRMS.reopen })}>
                            <RotateCcw className="h-4 w-4" aria-hidden /> Reabrir
                        </Button>
                    )}
                    {can("revoke") && (
                        <Button variant="ghost" className="gap-1.5 text-destructive" onClick={() => setConfirm({ action: "revoke", ...CONFIRMS.revoke })}>
                            <Link2Off className="h-4 w-4" aria-hidden /> Revogar link
                        </Button>
                    )}
                    {can("cancel") && (
                        <Button variant="ghost" className="gap-1.5 text-destructive" onClick={() => setConfirm({ action: "cancel", ...CONFIRMS.cancel })}>
                            <Ban className="h-4 w-4" aria-hidden /> Cancelar pedido
                        </Button>
                    )}
                </div>
                {order.workId && <p className="rounded-md border border-success/40 bg-success/10 p-2 text-xs text-success">Trabalho criado na coluna Abertura.</p>}
            </CardContent>
            {sending && <SendDialog order={order} onClose={() => setSending(false)} />}
            {rejecting && <RejectDialog order={order} pending={action.isPending} onClose={() => setRejecting(false)} onConfirm={(reason) => action.mutate({ action: "reject", data: { reason: reason || null, version: order.version } }, { onSuccess: () => setRejecting(false) })} />}
            <ConfirmDialog
                open={confirm !== null}
                onOpenChange={(open) => !open && setConfirm(null)}
                title={confirm?.title ?? ""}
                description={confirm?.description}
                confirmLabel={confirm?.label ?? "Confirmar"}
                variant={confirm?.destructive ? "destructive" : "default"}
                pending={action.isPending}
                onConfirm={() => confirm && action.mutate({ action: confirm.action, data: { version: order.version } }, { onSettled: () => setConfirm(null) })}
            />
        </Card>
    )
}

function SendDialog({ order, onClose }: { order: OrderDto; onClose: () => void }) {
    const send = useSendOrder(order.businessId, order.id)
    const clients = useClients()
    const client = clients.data?.items.find((item) => item.id === order.clientId)
    const today = todayKeyIn(browserTimeZone())
    const [validUntil, setValidUntil] = useState(order.link && !order.link.expired ? order.link.validUntil : addDaysToKey(today, order.quoteValidityDays))
    const [email, setEmail] = useState(Boolean(client?.email))
    const reuse = order.status === "sent" && order.link && !order.link.expired
    return (
        <Dialog open onOpenChange={(open) => !open && !send.isPending && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{order.status === "draft" ? "Enviar orçamento" : reuse ? "Prorrogar ou reenviar" : "Reenviar com novo link"}</DialogTitle>
                    <DialogDescription>
                        {reuse ? "O link atual continua o mesmo; só a validade muda." : "Um link secreto é gerado para o cliente ver o orçamento, aceitar ou recusar, sem login."} A versão atual fica registrada no histórico.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <Field id="order-valid-until" label="Válido até">
                        <DatePicker id="order-valid-until" value={validUntil} onChange={setValidUntil} fromDate={new Date(`${today}T00:00:00`)} inputDisabled={send.isPending} />
                    </Field>
                    <label className="flex items-start gap-2 text-sm">
                        <Checkbox checked={email} disabled={send.isPending || !client?.email} onCheckedChange={(value) => setEmail(value === true)} />
                        <span>
                            Enviar por e-mail para o cliente
                            <span className="block text-xs text-muted-foreground">{client?.email ? client.email : "O cliente não tem e-mail: copie o link depois de enviar."}</span>
                        </span>
                    </label>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" disabled={send.isPending} onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button type="button" className="gap-1.5" disabled={send.isPending || !validUntil} onClick={() => send.mutate({ validUntil, email, version: order.version }, { onSuccess: onClose })}>
                        {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                        Enviar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function RejectDialog({ order, pending, onClose, onConfirm }: { order: OrderDto; pending: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
    const [reason, setReason] = useState("")
    return (
        <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Registrar a recusa de {order.code}?</DialogTitle>
                    <DialogDescription>Use quando o cliente recusou fora do link. O pedido pode ser reaberto depois.</DialogDescription>
                </DialogHeader>
                <Field id="order-reject-reason" label="Motivo (opcional)">
                    <Textarea id="order-reject-reason" rows={3} value={reason} maxLength={ORDER_REJECT_REASON_MAX} disabled={pending} onChange={(event) => setReason(event.target.value)} />
                </Field>
                <DialogFooter>
                    <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button type="button" variant="destructive" disabled={pending} onClick={() => onConfirm(reason.trim())}>
                        Registrar recusa
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function OrderDecisionCard({ order }: { order: OrderDto }) {
    if (!order.decisions.length) return null
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Decisões</CardTitle>
            </CardHeader>
            <CardContent>
                <ul className="space-y-3 text-sm">
                    {[...order.decisions].reverse().map((decision, index) => (
                        <li key={`${decision.at}-${index}`} className="space-y-0.5 rounded-md border p-2.5">
                            <p className={decision.kind === "accept" ? "font-medium text-success" : "font-medium text-destructive"}>
                                {decision.kind === "accept" ? "Aceito" : "Recusado"} {decision.by === "client" ? "pelo cliente (link)" : "pelo prestador"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {format(new Date(decision.at), "dd/MM/yyyy HH:mm")}
                                {decision.by === "client" ? `${decision.name ? ` · ${decision.name}` : ""}${decision.ip ? ` · IP ${decision.ip}` : ""}` : ` · ${decision.actorName ?? decision.name ?? "Usuário"}`}
                                {decision.versionNumber ? ` · versão ${decision.versionNumber}` : ""}
                            </p>
                            {decision.reason && <p className="whitespace-pre-wrap text-xs">Motivo: {decision.reason}</p>}
                        </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    )
}

function OrderVersionsCard({ order }: { order: OrderDto }) {
    const reduceMotion = useReducedMotion()
    if (!order.versions.length) return null
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-base">
                    <History className="h-4 w-4" aria-hidden /> Histórico de versões
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ol className="relative space-y-4 border-l pl-4">
                    {order.versions.map((version, index) => (
                        <motion.li key={version.number} initial={reduceMotion ? false : { opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduceMotion ? 0 : index * 0.03 }} className="relative text-sm">
                            <span className={`absolute -left-[1.3rem] top-1.5 h-2.5 w-2.5 rounded-full ${version.published ? "bg-primary" : "bg-muted-foreground/50"}`} aria-hidden />
                            <p className="font-medium">
                                Versão {version.number} · {ORDER_VERSION_REASON_LABELS[version.reason]}
                                {!version.published && <span className="ml-1 text-xs font-normal text-muted-foreground">(não enviada)</span>}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {format(new Date(version.createdAt), "dd/MM/yyyy HH:mm")}
                                {version.actorName ? ` · ${version.actorName}` : ""}
                            </p>
                            {version.changes.length > 0 && (
                                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                                    {version.changes.map((change, position) => (
                                        <li key={position}>{describeOrderChange(change, version.snapshot.currency)}</li>
                                    ))}
                                </ul>
                            )}
                        </motion.li>
                    ))}
                </ol>
            </CardContent>
        </Card>
    )
}
