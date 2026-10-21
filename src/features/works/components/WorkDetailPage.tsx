"use client"

import { useId, useState, type ComponentType } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Archive, ArchiveRestore, ArrowLeft, FileSearch, ReceiptText, RefreshCw, Trash2, Trophy, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorCode, apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { browserTimeZone, todayKeyIn } from "@/lib/timezone"
import { businessSpaceHref } from "@/features/businesses/constants"
import { formatMoney } from "@/features/businesses/format"
import { useBusinessSpace } from "@/features/businesses/components/space/BusinessSpaceLayout"
import { SuccessDialog } from "@/features/businesses/components/space/SuccessesPage"
import { dateKeyLabel } from "@/features/orders/components/OrderBadges"
import { orderHref } from "@/features/orders/components/OrdersPage"
import { useWork, useWorkAction, useWorkBoard } from "../hooks/useWorks"
import type { WorkDetailDto } from "../types"
import { ArchivedBadge, HoursProgress, WorkDeadlineBadge } from "./WorkBadges"
import { WorkColumnMenu } from "./WorkColumnMenu"
import { AttachmentsSection, MovesSection, NotesSection, OrderDataSection, PaymentSection, TimeSection, type SectionProps } from "./WorkDetailSections"
import { useWorkMoveFlow } from "./WorkMoveFlow"

type TabId = "order" | "time" | "notes" | "attachments" | "moves" | "payment"

const TABS: readonly { id: TabId; label: string; Component: ComponentType<SectionProps>; count: ((work: WorkDetailDto) => number) | null }[] = [
    { id: "order", label: "Pedido", Component: OrderDataSection, count: null },
    { id: "time", label: "Horas", Component: TimeSection, count: (work) => work.timeEntries.length },
    { id: "notes", label: "Notas", Component: NotesSection, count: (work) => work.notes.length },
    { id: "attachments", label: "Anexos", Component: AttachmentsSection, count: (work) => work.attachments.length },
    { id: "moves", label: "Movimentações", Component: MovesSection, count: (work) => work.moves.length },
    { id: "payment", label: "Pagamento", Component: PaymentSection, count: null },
]

type Confirm = "archive" | "restore" | "delete" | null

/** Trabalho (`/negocios/[id]/trabalhos/[workId]`), no padrão da página da tarefa do Opex. */
export function WorkDetailPage({ workId }: { workId: string }) {
    const reduceMotion = useReducedMotion()
    const router = useRouter()
    const { business } = useBusinessSpace()
    const query = useWork(business.id, workId)
    const board = useWorkBoard(business.id)
    const flow = useWorkMoveFlow(board.columns)
    const action = useWorkAction(business.id)
    const [tab, setTab] = useState<TabId>("order")
    const [confirm, setConfirm] = useState<Confirm>(null)
    const [converting, setConverting] = useState(false)
    const baseId = useId()
    const back = businessSpaceHref(business.id, "trabalhos")
    const work = query.data
    const view = query.isLoading ? "loading" : query.isError ? (apiErrorCode(query.error) === "WORK_NOT_FOUND" ? "missing" : "error") : "ready"
    const active = TABS.find((item) => item.id === tab) ?? TABS[0]!
    const Section = active.Component

    const confirmText: Record<Exclude<Confirm, null>, { title: string; description: string; label: string; destructive: boolean }> = {
        archive: {
            title: `Arquivar ${work?.code ?? "o trabalho"}?`,
            description:
                work?.column === "paid" && work.payment
                    ? `O trabalho está em Pago: enquanto estiver arquivado, ${formatMoney(work.payment.receivedCents, work.currency)} SAEM do faturamento (metas e dashboard). Ele some do Kanban/Tabela e é excluído definitivamente depois do prazo de Trabalhos; até lá, pode ser restaurado.`
                    : "Desistência/cancelamento depois do aceite: o trabalho some do Kanban/Tabela e é excluído definitivamente depois do prazo de Trabalhos; até lá, pode ser restaurado.",
            label: "Arquivar",
            destructive: true,
        },
        restore: { title: `Restaurar ${work?.code ?? "o trabalho"}?`, description: work?.column === "paid" ? "Volta à coluna Pago e ao faturamento com o pagamento registrado." : "Volta ao quadro na mesma coluna.", label: "Restaurar", destructive: false },
        delete: {
            title: `Excluir ${work?.code ?? "o trabalho"} definitivamente?`,
            description: "Horas, notas, anexos e movimentações são apagados. O pedido continua Aceito como registro e o sucesso ligado perde o vínculo. Não dá para desfazer.",
            label: "Excluir definitivamente",
            destructive: true,
        },
    }

    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
                    <Link href={back} scroll={false}>
                        <ArrowLeft className="h-4 w-4" aria-hidden /> Trabalhos
                    </Link>
                </Button>
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => void query.refetch()} disabled={query.isFetching} aria-label="Atualizar trabalho">
                    <motion.span animate={{ rotate: query.isFetching ? 360 : 0 }} transition={query.isFetching ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0.2 }} className="inline-flex">
                        <RefreshCw className="h-4 w-4" aria-hidden />
                    </motion.span>
                    Atualizar
                </Button>
            </div>

            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                    {view === "loading" && (
                        <div className="grid gap-4 lg:grid-cols-[1fr_320px]" aria-label="Carregando trabalho">
                            <div className="space-y-3">
                                <Skeleton className="h-8 w-2/3" />
                                <Skeleton className="h-64 w-full" />
                            </div>
                            <Skeleton className="h-96 w-full" />
                        </div>
                    )}
                    {view === "missing" && (
                        <EmptyState icon={FileSearch} title="Trabalho não encontrado" description="Ele pode ter sido excluído ou o endereço está incorreto.">
                            <Button asChild size="sm" variant="outline">
                                <Link href={back}>Voltar para Trabalhos</Link>
                            </Button>
                        </EmptyState>
                    )}
                    {view === "error" && <ErrorState title="Não foi possível carregar o trabalho" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />}
                    {view === "ready" && work && (
                        <div className="space-y-4">
                            <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="min-w-0 space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-sm font-semibold text-primary">{work.code}</span>
                                        <WorkDeadlineBadge column={work.column} dueDate={work.dueDate} alertDays={work.deadlineAlertDays} />
                                        {work.status === "archived" && <ArchivedBadge />}
                                    </div>
                                    <h1 className="text-xl font-semibold leading-tight md:text-2xl">{work.title}</h1>
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    <WorkColumnMenu work={work} columns={board.columns} moving={flow.movingId === work.id} disabled={!work.editable} onMove={(current, column) => flow.move(current, column)} size="default" />
                                    <Button asChild variant="outline" size="icon" className="h-9 w-9" title="Ver pedido">
                                        <Link href={orderHref(work.businessId, work.orderId)} aria-label="Ver pedido">
                                            <ReceiptText className="h-4 w-4" aria-hidden />
                                        </Link>
                                    </Button>
                                    {work.success ? (
                                        <Button asChild variant="outline" className="h-9 gap-1.5">
                                            <Link href={businessSpaceHref(work.businessId, "sucessos")}>
                                                <Trophy className="h-4 w-4" aria-hidden /> Ver sucesso
                                            </Link>
                                        </Button>
                                    ) : (
                                        work.editable && (
                                            <Button type="button" variant="outline" className="h-9 gap-1.5" onClick={() => setConverting(true)}>
                                                <Trophy className="h-4 w-4" aria-hidden /> Converter em Sucesso
                                            </Button>
                                        )
                                    )}
                                    {work.status === "active" && work.editable && (
                                        <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => setConfirm("archive")} aria-label="Arquivar trabalho" title="Arquivar trabalho">
                                            <Archive className="h-4 w-4" aria-hidden />
                                        </Button>
                                    )}
                                    {work.status === "archived" && business.status === "active" && (
                                        <>
                                            <Button type="button" variant="outline" className="h-9 gap-1.5" onClick={() => setConfirm("restore")}>
                                                <ArchiveRestore className="h-4 w-4" aria-hidden /> Restaurar
                                            </Button>
                                            <Button type="button" variant="outline" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => setConfirm("delete")} aria-label="Excluir definitivamente" title="Excluir definitivamente">
                                                <Trash2 className="h-4 w-4" aria-hidden />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </header>

                            {work.status === "archived" && (
                                <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                                    Arquivado{work.purgeAt ? `: será excluído definitivamente em ${new Date(work.purgeAt).toLocaleDateString("pt-BR")}` : ""}.{work.column === "paid" && work.payment ? " Fora do faturamento enquanto estiver arquivado." : ""} Restaure para editar.
                                </p>
                            )}

                            <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
                                <Card className="min-w-0">
                                    <CardContent className="space-y-4 pt-4">
                                        <div role="tablist" aria-label="Seções do trabalho" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b pb-px">
                                            {TABS.map((item) => {
                                                const isActive = tab === item.id
                                                const count = item.count?.(work)
                                                return (
                                                    <button
                                                        key={item.id}
                                                        id={`${baseId}-tab-${item.id}`}
                                                        type="button"
                                                        role="tab"
                                                        aria-selected={isActive}
                                                        aria-controls={`${baseId}-panel-${item.id}`}
                                                        onClick={() => setTab(item.id)}
                                                        className={cn("relative whitespace-nowrap px-3 pb-2.5 pt-1 text-sm transition-colors", isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                                                    >
                                                        {item.label}
                                                        {count ? <span className="ml-1.5 rounded bg-muted px-1.5 font-mono text-[11px]">{count}</span> : null}
                                                        {isActive && <motion.span layoutId="work-detail-tab" className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-primary" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                        <AnimatePresence mode="wait" initial={false}>
                                            <motion.div key={tab} id={`${baseId}-panel-${tab}`} role="tabpanel" aria-labelledby={`${baseId}-tab-${tab}`} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }}>
                                                <Section work={work} onEditPayment={() => flow.editPayment(work)} onPay={() => flow.move(work, "paid")} onUnpay={() => flow.unpay(work)} />
                                            </motion.div>
                                        </AnimatePresence>
                                    </CardContent>
                                </Card>
                                <WorkSidebar work={work} />
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>

            {flow.dialogs}
            {converting && work && (
                <SuccessDialog
                    success={null}
                    preset={{ title: work.title.slice(0, 160), date: work.payment?.paidOn ?? todayKeyIn(browserTimeZone()), clientId: work.clientId, workId: work.id, workCode: work.code }}
                    onClose={() => setConverting(false)}
                    onSaved={() => void query.refetch()}
                />
            )}
            <ConfirmDialog
                open={confirm !== null}
                onOpenChange={(open) => !open && setConfirm(null)}
                title={confirm ? confirmText[confirm].title : ""}
                description={confirm ? confirmText[confirm].description : undefined}
                confirmLabel={confirm ? confirmText[confirm].label : "Confirmar"}
                variant={confirm && confirmText[confirm].destructive ? "destructive" : "default"}
                pending={action.isPending}
                onConfirm={() => {
                    if (!confirm || !work) return
                    action.mutate(
                        { id: work.id, action: confirm },
                        {
                            onSuccess: () => {
                                if (confirm === "delete") router.push(back)
                            },
                            onSettled: () => setConfirm(null),
                        },
                    )
                }}
            />
        </motion.section>
    )
}

function WorkSidebar({ work }: { work: WorkDetailDto }) {
    return (
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Resumo</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <Row label="Cliente">
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                            <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="truncate">{work.clientName ?? "Cliente removido"}</span>
                        </span>
                    </Row>
                    <Row label="Coluna">{work.columnName}</Row>
                    <Row label="Valor">
                        <span className="font-mono">{formatMoney(work.totalCents, work.currency)}</span>
                    </Row>
                    <Row label="Prazo">{dateKeyLabel(work.dueDate)}</Row>
                    {work.payment && (
                        <Row label="Recebido">
                            <span className="text-right">
                                <span className="block font-mono text-success">{formatMoney(work.payment.receivedCents, work.currency)}</span>
                                <span className="block text-xs text-muted-foreground">
                                    {dateKeyLabel(work.payment.paidOn)}
                                    {work.payment.method ? ` · ${work.payment.method}` : ""}
                                </span>
                            </span>
                        </Row>
                    )}
                    <HoursProgress estimatedMinutes={work.estimatedMinutes} loggedMinutes={work.loggedMinutes} className="pt-1" />
                    <p className="border-t pt-3 text-xs text-muted-foreground">Criado em {new Date(work.createdAt).toLocaleDateString("pt-BR")} pelo aceite do pedido.</p>
                </CardContent>
            </Card>
        </aside>
    )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <span className="shrink-0 text-muted-foreground">{label}</span>
            <span className="min-w-0 text-right">{children}</span>
        </div>
    )
}
