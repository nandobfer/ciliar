"use client"

import { useCallback, useMemo, useState, type ReactNode } from "react"
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePicker } from "@/components/ui/date-picker"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { MoneyInput } from "@/components/ui/money-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { browserTimeZone, todayKeyIn } from "@/lib/timezone"
import { formatMoney } from "@/features/businesses/format"
import { currencySymbol } from "@/features/businesses/components/interview/InterviewAnswerControl"
import type { BoardColumnView } from "../board"
import { WORK_PAYMENT_METHOD_MAX } from "../constants"
import { moveFlowOf } from "../logic"
import { useMoveWork, usePaymentMethods } from "../hooks/useWorks"
import type { WorkSummaryDto } from "../types"
import { ColumnBadge } from "./WorkBadges"

type Pending = { kind: "pay"; work: WorkSummaryDto; position?: number } | { kind: "unpay"; work: WorkSummaryDto; column: string | null; position?: number } | null

/**
 * Fluxo do movimento (Kanban, Tabela e detalhe): coluna comum move direto; entrar em Pago pede o
 * pagamento (data, valor recebido e forma); sair de Pago pede confirmação explícita (sai do
 * faturamento). `columns` = colunas do quadro para rotular o destino.
 */
export function useWorkMoveFlow(columns: readonly BoardColumnView[]) {
    const mutation = useMoveWork()
    const [pending, setPending] = useState<Pending>(null)
    const nameOf = useCallback((key: string) => columns.find((column) => column.key === key)?.label ?? key, [columns])

    const move = useCallback(
        (work: WorkSummaryDto, column: string, position?: number) => {
            const flow = moveFlowOf(work.column, column)
            if (flow === "pay") return setPending({ kind: "pay", work, position })
            if (flow === "unpay") return setPending({ kind: "unpay", work, column, position })
            if (flow === "none" && position === undefined) return
            mutation.mutate({ kind: "move", work, column, columnName: nameOf(column), position })
        },
        [mutation, nameOf],
    )
    /** "Editar pagamento" de um trabalho já pago (W4). */
    const editPayment = useCallback((work: WorkSummaryDto) => setPending({ kind: "pay", work }), [])
    /** "Sair de Pago" sem destino escolhido: o diálogo pede a coluna. */
    const unpay = useCallback((work: WorkSummaryDto) => setPending({ kind: "unpay", work, column: null }), [])

    const close = () => setPending(null)
    const dialogs: ReactNode = (
        <>
            {pending?.kind === "pay" && (
                <PaymentDialog
                    work={pending.work}
                    pending={mutation.isPending}
                    onClose={close}
                    onConfirm={(payment) => mutation.mutate({ kind: "pay", work: pending.work, ...payment, position: pending.position }, { onSuccess: close })}
                />
            )}
            {pending?.kind === "unpay" && (
                <UnpayDialog
                    work={pending.work}
                    columns={columns.filter((column) => column.key !== "paid" && column.key !== "others")}
                    initial={pending.column}
                    pending={mutation.isPending}
                    onClose={close}
                    onConfirm={(column) => mutation.mutate({ kind: "unpay", work: pending.work, column, columnName: nameOf(column), position: pending.position }, { onSuccess: close })}
                />
            )}
        </>
    )
    const movingId = mutation.isPending ? (mutation.variables?.work.id ?? null) : null
    return { move, editPayment, unpay, movingId, dialogs }
}

function PaymentDialog({ work, pending, onClose, onConfirm }: { work: WorkSummaryDto; pending: boolean; onClose: () => void; onConfirm: (payment: { paidOn: string; receivedCents: number; method: string | null }) => void }) {
    const editing = work.column === "paid" && Boolean(work.payment)
    const today = todayKeyIn(browserTimeZone())
    const [paidOn, setPaidOn] = useState(work.payment?.paidOn ?? today)
    const [received, setReceived] = useState((work.payment?.receivedCents ?? work.totalCents) / 100)
    const [method, setMethod] = useState(work.payment?.method ?? "")
    const methods = usePaymentMethods()
    const options = useMemo(() => (methods.data ?? []).slice(0, 8), [methods.data])
    const receivedCents = Math.round(received * 100)
    return (
        <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-success" aria-hidden /> {editing ? `Editar pagamento de ${work.code}` : `Mover ${work.code} para Pago`}
                    </DialogTitle>
                    <DialogDescription>
                        {editing ? "Corrige o pagamento registrado; o anterior fica no histórico." : "O trabalho entra no faturamento bruto pela data do pagamento (metas e dashboard)."}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <Field id="work-paid-on" label="Data do pagamento">
                        <DatePicker id="work-paid-on" value={paidOn} onChange={setPaidOn} inputDisabled={pending} />
                    </Field>
                    <Field id="work-received" label="Valor recebido">
                        <MoneyInput id="work-received" prefix={currencySymbol(work.currency)} value={received} disabled={pending} onChange={setReceived} />
                        <p className="mt-1 text-xs text-muted-foreground">
                            Valor do pedido: {formatMoney(work.totalCents, work.currency)}
                            {receivedCents !== work.totalCents && (
                                <button type="button" className="ml-2 text-primary hover:underline" disabled={pending} onClick={() => setReceived(work.totalCents / 100)}>
                                    usar este valor
                                </button>
                            )}
                        </p>
                    </Field>
                    <Field id="work-method" label="Forma de pagamento">
                        <Input id="work-method" list="work-method-options" value={method} maxLength={WORK_PAYMENT_METHOD_MAX} disabled={pending} placeholder="PIX, transferência…" onChange={(event) => setMethod(event.target.value)} />
                        <datalist id="work-method-options">
                            {(methods.data ?? []).map((option) => (
                                <option key={option} value={option} />
                            ))}
                        </datalist>
                        {options.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Formas já usadas">
                                {options.map((option) => (
                                    <button
                                        key={option}
                                        type="button"
                                        disabled={pending}
                                        onClick={() => setMethod(option)}
                                        className={cn("rounded-full border px-2 py-0.5 text-xs transition-colors hover:border-primary hover:text-primary", method === option && "border-primary bg-primary/10 text-primary")}
                                    >
                                        {option}
                                    </button>
                                ))}
                            </div>
                        )}
                    </Field>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button type="button" className="gap-1.5" disabled={pending || !paidOn || receivedCents < 0} onClick={() => onConfirm({ paidOn, receivedCents, method: method.trim() || null })}>
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                        {editing ? "Salvar pagamento" : "Registrar pagamento"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function UnpayDialog({ work, columns, initial, pending, onClose, onConfirm }: { work: WorkSummaryDto; columns: readonly BoardColumnView[]; initial: string | null; pending: boolean; onClose: () => void; onConfirm: (column: string) => void }) {
    const [column, setColumn] = useState(initial ?? "validation")
    const [confirmed, setConfirmed] = useState(false)
    return (
        <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-warning" aria-hidden /> Tirar {work.code} de Pago?
                    </DialogTitle>
                    <DialogDescription>
                        O trabalho sai do faturamento bruto (metas e dashboard)
                        {work.payment ? ` — ${formatMoney(work.payment.receivedCents, work.currency)} recebidos em ${work.payment.paidOn.split("-").reverse().join("/")}` : ""}. O registro do pagamento fica no histórico.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <Field id="work-unpay-column" label="Voltar para a coluna">
                        <Select value={column} onValueChange={setColumn} disabled={pending}>
                            <SelectTrigger id="work-unpay-column" className="h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {columns.map((option) => (
                                    <SelectItem key={option.key} value={option.key}>
                                        <ColumnBadge column={option} />
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <label className="flex items-start gap-2 text-sm">
                        <Checkbox checked={confirmed} disabled={pending} onCheckedChange={(value) => setConfirmed(value === true)} />
                        <span>Entendo que o trabalho sai do faturamento.</span>
                    </label>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button type="button" variant="destructive" className="gap-1.5" disabled={pending || !confirmed || !column} onClick={() => onConfirm(column)}>
                        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                        Sair de Pago
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
