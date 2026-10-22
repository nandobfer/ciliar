"use client"

import { usePermissions } from "@nandobfer/perfix/react"
import { useMemo, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { CheckCircle2, History, Loader2, MessageSquare, Paperclip, Pencil, Plus, Send, Timer, Trash2, Undo2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DatePicker } from "@/components/ui/date-picker"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FormFooter } from "@/components/ui/form-footer"
import { FORM_GRID } from "@/components/ui/form-grid"
import { IconAction } from "@/components/ui/icon-action"
import { Input } from "@/components/ui/input"
import { MoneyInput } from "@/components/ui/money-input"
import { SearchPicker } from "@/components/ui/search-picker"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { listContainer, listItem } from "@/components/motion/presets"
import { formatAttachmentSize } from "@/lib/attachments"
import { withBasePath } from "@/lib/base-path"
import { browserTimeZone, todayKeyIn } from "@/lib/timezone"
import { formatMoney } from "@/features/businesses/format"
import { currencySymbol } from "@/features/businesses/components/interview/InterviewAnswerControl"
import { UploadField } from "@/features/businesses/components/space/UploadField"
import { useBusinessUploads, useItemList } from "@/features/businesses/hooks/useBusinessSpace"
import { dateKeyLabel } from "@/features/orders/components/OrderBadges"
import { OrderVersionsCard } from "@/features/orders/components/OrderPage"
import { formatMinutes, itemSubtotalCents, parseHoursInput, suggestedTotalCents } from "@/features/orders/logic"
import { WORK_ATTACHMENTS_MAX, WORK_NOTE_MAX, WORK_PAYMENT_EVENT_LABELS, WORK_TIME_DESCRIPTION_MAX, type TimeEntrySource } from "../constants"
import { timeEntryValueCents } from "../logic"
import { workUpdateSchema } from "../schemas"
import type { TimeEntryDto, WorkDetailDto } from "../types"
import { useDeleteTimeEntry, useSaveTimeEntry, useUpdateWork, useWorkAttachments, useWorkNote } from "../hooks/useWorks"

const dateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })

function Empty({ icon: Icon, children }: { icon: typeof History; children: ReactNode }) {
    return (
        <p className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            <Icon className="h-4 w-4" aria-hidden /> {children}
        </p>
    )
}

export interface SectionProps {
    work: WorkDetailDto
    /** Ações de movimento (Pago) vindas do fluxo da página. */
    onEditPayment?: () => void
    onPay?: () => void
    onUnpay?: () => void
}

// ── Dados do pedido (itens, horas estimadas, valor e prazo) ───────────────

interface ItemDraft {
    key: string
    id?: string
    activityId: string
    activityName: string
    hourlyRateCents: number
    hours: string
}

function draftOf(work: WorkDetailDto) {
    return {
        items: work.items.map<ItemDraft>((item) => ({ key: item.id, id: item.id, activityId: item.activityId, activityName: item.activityName, hourlyRateCents: item.hourlyRateCents, hours: formatMinutes(item.minutes) })),
        manualTotal: work.totalManual,
        totalCents: work.totalCents,
        dueDate: work.dueDate ?? "",
    }
}

/**
 * Dados comerciais editáveis pelo trabalho (W1): itens com horas estimadas `h:mm` e o valor/hora
 * congelado, valor ajustado e prazo. Salvar grava uma versão do pedido (não enviada ao cliente).
 */
export function OrderDataSection({ work }: SectionProps) {
    const reduceMotion = useReducedMotion()
    const activities = useItemList(work.businessId, "activities")
    const save = useUpdateWork(work.businessId, work.id)
    const [draft, setDraft] = useState(() => draftOf(work))
    const [baseline, setBaseline] = useState(() => draftOf(work))
    const [base, setBase] = useState(work.version)
    const [error, setError] = useState<string | null>(null)
    const dirty = JSON.stringify(draft) !== JSON.stringify(baseline)
    const readOnly = !work.editable
    const disabled = readOnly || save.isPending

    // Atualização externa sem alterações locais: acompanha a versão nova (ajuste durante a renderização).
    if (work.version !== base && !dirty) {
        setDraft(draftOf(work))
        setBaseline(draftOf(work))
        setBase(work.version)
    }

    const patch = (next: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...next }))
    const parsedItems = draft.items.map((item) => ({ ...item, minutes: parseHoursInput(item.hours) }))
    const suggested = suggestedTotalCents(parsedItems.map((item) => ({ minutes: item.minutes ?? 0, hourlyRateCents: item.hourlyRateCents })))
    const activeActivities = (activities.data?.items ?? []).filter((activity) => activity.status === "active" && activity.active)

    const submit = async () => {
        const invalid = parsedItems.find((item) => item.minutes === null)
        if (invalid) return setError(`Horas de "${invalid.activityName}": use o formato h:mm (ex.: 2:30).`)
        const data = {
            items: parsedItems.map((item) => (item.id ? { id: item.id, minutes: item.minutes } : { activityId: item.activityId, minutes: item.minutes })),
            totalOverrideCents: draft.manualTotal ? draft.totalCents : null,
            dueDate: draft.dueDate || null,
            version: base,
        }
        const parsed = workUpdateSchema.safeParse(data)
        if (!parsed.success) return setError(parsed.error.issues[0]!.message)
        setError(null)
        const saved = await save.mutateAsync(data).catch(() => null)
        if (saved) {
            setDraft(draftOf(saved))
            setBaseline(draftOf(saved))
            setBase(saved.version)
        }
    }

    return (
        <div className="space-y-4">
            <form
                className="space-y-4"
                noValidate
                onSubmit={(event) => {
                    event.preventDefault()
                    void submit()
                }}
            >
                <p className="text-xs text-muted-foreground">Só atividades ativas entram em novos itens; o valor/hora é copiado agora. Cada alteração fica no histórico do pedido; o link do cliente continua mostrando a versão aceita.</p>
                {draft.items.length > 0 && (
                    <ul className="space-y-2">
                        <AnimatePresence initial={false}>
                            {parsedItems.map((item, index) => (
                                <motion.li key={item.key} layout={!reduceMotion} initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-center gap-2 rounded-md border px-3 py-2 sm:grid-cols-[minmax(0,1fr)_6rem_9rem_9rem_auto]">
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium">{item.activityName}</span>
                                        <span className="block text-xs text-muted-foreground sm:hidden">{formatMoney(item.hourlyRateCents, work.currency)}/h</span>
                                    </span>
                                    <Input
                                        aria-label={`Horas estimadas de ${item.activityName} (h:mm)`}
                                        value={item.hours}
                                        inputMode="numeric"
                                        placeholder="h:mm"
                                        disabled={disabled}
                                        aria-invalid={item.minutes === null}
                                        className="font-mono"
                                        onChange={(event) => patch({ items: draft.items.map((entry, position) => (position === index ? { ...entry, hours: event.target.value } : entry)) })}
                                    />
                                    <span className="hidden text-right font-mono text-xs text-muted-foreground sm:block">{formatMoney(item.hourlyRateCents, work.currency)}/h</span>
                                    <span className="hidden text-right font-mono text-sm sm:block">{formatMoney(itemSubtotalCents(item.minutes ?? 0, item.hourlyRateCents), work.currency)}</span>
                                    {!disabled ? <IconAction icon={Trash2} label={`Remover ${item.activityName}`} tone="danger" onClick={() => patch({ items: draft.items.filter((_, position) => position !== index) })} /> : <span />}
                                </motion.li>
                            ))}
                        </AnimatePresence>
                    </ul>
                )}
                {!disabled && (
                    <SearchPicker
                        trigger={
                            <Button type="button" variant="outline" size="sm" className="gap-1.5">
                                <Plus className="h-4 w-4" aria-hidden /> Adicionar item
                            </Button>
                        }
                        items={activeActivities}
                        loading={activities.isLoading}
                        getKey={(item) => item.id}
                        searchKeys={["name", "category"]}
                        renderItem={(item) => (
                            <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                                <span className="truncate text-sm">{item.name}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">{formatMoney(item.hourlyRateCents, work.currency)}/h</span>
                            </span>
                        )}
                        onPick={(item) => patch({ items: [...draft.items, { key: `${item.id}-${Date.now()}`, activityId: item.id, activityName: item.name, hourlyRateCents: item.hourlyRateCents, hours: "1:00" }] })}
                        searchLabel="Buscar atividade"
                        listLabel="Atividades ativas"
                        emptyText="Nenhuma atividade ativa: cadastre em Atividades"
                        emptySearchText="Nenhuma atividade encontrada"
                    />
                )}
                <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">Calculado ({formatMinutes(parsedItems.reduce((sum, item) => sum + (item.minutes ?? 0), 0))} h × valor/hora)</span>
                        <span className="font-mono">{formatMoney(suggested, work.currency)}</span>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={draft.manualTotal} disabled={disabled} onCheckedChange={(value) => patch({ manualTotal: value === true, totalCents: value === true ? (draft.manualTotal ? draft.totalCents : suggested) : draft.totalCents })} />
                        Ajustar o valor total manualmente
                    </label>
                    {draft.manualTotal && (
                        <Field id="work-total" label="Valor total ajustado">
                            <MoneyInput id="work-total" prefix={currencySymbol(work.currency)} value={draft.totalCents / 100} disabled={disabled} onChange={(value) => patch({ totalCents: Math.round(value * 100) })} />
                        </Field>
                    )}
                    <p className="flex items-baseline justify-between text-base font-semibold" aria-live="polite">
                        <span>Valor total {draft.manualTotal && <span className="ml-1 rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning">ajustado</span>}</span>
                        <span className="font-mono">{formatMoney(draft.manualTotal ? draft.totalCents : suggested, work.currency)}</span>
                    </p>
                </div>
                <Field id="work-due" label="Data de entrega (prazo)">
                    <DatePicker id="work-due" value={draft.dueDate} onChange={(value) => patch({ dueDate: value })} inputDisabled={disabled} />
                </Field>
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}
                {!readOnly && (
                    <FormFooter>
                        <Button type="button" variant="ghost" disabled={save.isPending || !dirty} onClick={() => setDraft(baseline)}>
                            Descartar
                        </Button>
                        <Button type="submit" disabled={save.isPending || !dirty}>
                            {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                            Salvar nova versão
                        </Button>
                    </FormFooter>
                )}
            </form>
            <OrderVersionsCard order={work} />
        </div>
    )
}

// ── Horas ──────────────────────────────────────────────────────────────────

export function TimeSection({ work }: SectionProps) {
    const [editing, setEditing] = useState<TimeEntryDto | "new" | null>(null)
    const [deleting, setDeleting] = useState<TimeEntryDto | null>(null)
    const remove = useDeleteTimeEntry(work.businessId, work.id)
    const value = work.timeEntries.reduce((sum, entry) => sum + entry.valueCents, 0)
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                    <span className="font-mono font-semibold text-foreground">{formatMinutes(work.loggedMinutes)} h</span> apontadas de {formatMinutes(work.estimatedMinutes)} h estimadas
                    {work.timeEntries.length > 0 && <> · {formatMoney(value, work.currency)} pelo valor/hora</>}
                </p>
                {work.editable && (
                    <Button type="button" size="sm" className="gap-1.5" onClick={() => setEditing("new")}>
                        <Plus className="h-4 w-4" aria-hidden /> Lançar horas
                    </Button>
                )}
            </div>
            {work.timeEntries.length === 0 ? (
                <Empty icon={Timer}>Nenhuma hora apontada.</Empty>
            ) : (
                <motion.ul variants={listContainer} initial="hidden" animate="visible" className="divide-y rounded-md border">
                    {work.timeEntries.map((entry) => (
                        <motion.li key={entry.id} variants={listItem} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                            <div className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">
                                    {entry.name}
                                    {entry.source === "activity" && <span className="ml-1.5 rounded border px-1 text-[10px] font-normal text-muted-foreground">fora do pedido</span>}
                                </span>
                                <span className="block truncate text-xs text-muted-foreground" title={entry.description ?? undefined}>
                                    {entry.description ?? "Sem descrição"}
                                </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                                {dateKeyLabel(entry.date)}
                                {entry.authorName ? ` · ${entry.authorName}` : ""}
                            </span>
                            <span className="text-right">
                                <span className="block font-mono text-xs font-semibold">{formatMinutes(entry.minutes)}</span>
                                <span className="block font-mono text-[11px] text-muted-foreground">{formatMoney(entry.valueCents, work.currency)}</span>
                            </span>
                            {work.editable && (
                                <span className="flex items-center gap-1">
                                    <IconAction icon={Pencil} label={`Editar o lançamento de ${dateKeyLabel(entry.date)}`} onClick={() => setEditing(entry)} />
                                    <IconAction icon={Trash2} label={`Excluir o lançamento de ${dateKeyLabel(entry.date)}`} tone="danger" onClick={() => setDeleting(entry)} />
                                </span>
                            )}
                        </motion.li>
                    ))}
                </motion.ul>
            )}
            {editing && <TimeEntryDialog key={editing === "new" ? "new" : editing.id} work={work} entry={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
                title="Excluir o lançamento?"
                description={deleting ? `${formatMinutes(deleting.minutes)} h de ${deleting.name} em ${dateKeyLabel(deleting.date)}. As horas apontadas do trabalho são recalculadas.` : undefined}
                confirmLabel="Excluir"
                variant="destructive"
                pending={remove.isPending}
                onConfirm={() => deleting && remove.mutate(deleting.id, { onSettled: () => setDeleting(null) })}
            />
        </div>
    )
}

function TimeEntryDialog({ work, entry, onClose }: { work: WorkDetailDto; entry: TimeEntryDto | null; onClose: () => void }) {
    const activities = useItemList(work.businessId, "activities")
    const save = useSaveTimeEntry(work.businessId, work.id)
    const today = todayKeyIn(browserTimeZone())
    const [ref, setRef] = useState(entry ? `${entry.source}:${entry.refId}` : work.items[0] ? `orderItem:${work.items[0].id}` : "")
    const [date, setDate] = useState(entry?.date ?? today)
    const [hours, setHours] = useState(entry ? formatMinutes(entry.minutes) : "1:00")
    const [description, setDescription] = useState(entry?.description ?? "")
    const [error, setError] = useState<string | null>(null)
    const orderActivityIds = new Set(work.items.map((item) => item.activityId))
    const others = (activities.data?.items ?? []).filter((activity) => activity.status === "active" && activity.active && !orderActivityIds.has(activity.id))
    const rateOf = useMemo(() => {
        const [source, id] = ref.split(":") as [TimeEntrySource, string]
        if (entry && ref === `${entry.source}:${entry.refId}`) return entry.hourlyRateCents
        if (source === "orderItem") return work.items.find((item) => item.id === id)?.hourlyRateCents ?? 0
        return (activities.data?.items ?? []).find((activity) => activity.id === id)?.hourlyRateCents ?? 0
    }, [ref, entry, work.items, activities.data])
    const minutes = parseHoursInput(hours)

    const submit = () => {
        if (!ref) return setError("Escolha o item ou a atividade.")
        if (minutes === null || minutes <= 0) return setError("Horas no formato h:mm (ex.: 1:30).")
        if (date > today) return setError("A data trabalhada não pode ser futura.")
        const [source, refId] = ref.split(":") as [TimeEntrySource, string]
        setError(null)
        save.mutate({ id: entry?.id, data: { source, refId, date, minutes, description: description.trim() || null, ...(entry ? { version: entry.version } : {}) } }, { onSuccess: onClose })
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{entry ? "Editar lançamento" : "Lançar horas"}</DialogTitle>
                    <DialogDescription>Apontamento manual das horas realizadas. O valor/hora fica congelado no lançamento.</DialogDescription>
                </DialogHeader>
                <form
                    className="space-y-4"
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault()
                        submit()
                    }}
                >
                    <Field id="time-ref" label="Item ou atividade">
                        <Select value={ref} onValueChange={setRef} disabled={save.isPending}>
                            <SelectTrigger id="time-ref" className="h-10">
                                <SelectValue placeholder="Escolha" />
                            </SelectTrigger>
                            <SelectContent>
                                {work.items.length > 0 && (
                                    <SelectGroup>
                                        <SelectLabel>Itens do pedido</SelectLabel>
                                        {work.items.map((item) => (
                                            <SelectItem key={item.id} value={`orderItem:${item.id}`}>
                                                {item.activityName} · {formatMoney(item.hourlyRateCents, work.currency)}/h
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                )}
                                {others.length > 0 && (
                                    <SelectGroup>
                                        <SelectLabel>Outras atividades do negócio</SelectLabel>
                                        {others.map((activity) => (
                                            <SelectItem key={activity.id} value={`activity:${activity.id}`}>
                                                {activity.name} · {formatMoney(activity.hourlyRateCents, work.currency)}/h
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                )}
                                {entry?.source === "activity" && !others.some((activity) => activity.id === entry.refId) && (
                                    <SelectItem value={`activity:${entry.refId}`}>{entry.name} (valor congelado)</SelectItem>
                                )}
                            </SelectContent>
                        </Select>
                    </Field>
                    <div className={FORM_GRID}>
                        <Field id="time-date" label="Data trabalhada">
                            <DatePicker id="time-date" value={date} onChange={setDate} toDate={new Date(`${today}T00:00:00`)} inputDisabled={save.isPending} />
                        </Field>
                        <Field id="time-hours" label="Horas (h:mm)">
                            <Input id="time-hours" value={hours} inputMode="numeric" placeholder="h:mm" className="font-mono" disabled={save.isPending} aria-invalid={minutes === null} onChange={(event) => setHours(event.target.value)} />
                        </Field>
                    </div>
                    <Field id="time-description" label="Descrição (opcional)">
                        <Textarea id="time-description" rows={2} value={description} maxLength={WORK_TIME_DESCRIPTION_MAX} disabled={save.isPending} onChange={(event) => setDescription(event.target.value)} />
                    </Field>
                    <p className="text-xs text-muted-foreground">
                        Valor do lançamento: <span className="font-mono">{formatMoney(timeEntryValueCents(minutes ?? 0, rateOf), work.currency)}</span>
                    </p>
                    {error && (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={save.isPending}>
                            {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                            {entry ? "Salvar" : "Lançar"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

// ── Notas ──────────────────────────────────────────────────────────────────

export function NotesSection({ work }: SectionProps) {
    const [content, setContent] = useState("")
    const [editing, setEditing] = useState<{ id: string; content: string } | null>(null)
    const [deleting, setDeleting] = useState<string | null>(null)
    const note = useWorkNote(work.businessId, work.id)
    const submit = async () => {
        const value = content.trim()
        if (!value) return
        const saved = await note.mutateAsync({ content: value }).catch(() => null)
        if (saved) setContent("")
    }
    return (
        <div className="space-y-4">
            {work.editable && (
                <div className="space-y-2" data-ctrl-enter-scope>
                    <Textarea rows={3} value={content} maxLength={WORK_NOTE_MAX} placeholder="Escreva uma nota interna (o cliente nunca vê)" aria-label="Nova nota" disabled={note.isPending} onChange={(event) => setContent(event.target.value)} />
                    <div className="flex items-center justify-end gap-2">
                        <Button type="button" data-ctrl-enter-submit size="sm" className="gap-1.5" disabled={note.isPending || !content.trim()} onClick={() => void submit()}>
                            {note.isPending && !editing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
                            Adicionar nota
                        </Button>
                    </div>
                </div>
            )}
            {work.notes.length === 0 ? (
                <Empty icon={MessageSquare}>Nenhuma nota.</Empty>
            ) : (
                <motion.ul variants={listContainer} initial="hidden" animate="visible" className="space-y-3">
                    {work.notes.map((item) => (
                        <motion.li key={item.id} variants={listItem} className="rounded-md border bg-card p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="truncate text-xs font-medium">{item.authorName ?? "Usuário"}</span>
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    {dateTime(item.createdAt)}
                                    {item.editedAt && <span title={`Editada em ${dateTime(item.editedAt)}`}>(editada)</span>}
                                    {item.mine && work.editable && editing?.id !== item.id && (
                                        <>
                                            <IconAction icon={Pencil} label="Editar a nota" onClick={() => setEditing({ id: item.id, content: item.content })} />
                                            <IconAction icon={Trash2} label="Excluir a nota" tone="danger" onClick={() => setDeleting(item.id)} />
                                        </>
                                    )}
                                </span>
                            </div>
                            {editing?.id === item.id ? (
                                <div className="space-y-2">
                                    <Textarea rows={3} value={editing.content} maxLength={WORK_NOTE_MAX} aria-label="Editar nota" disabled={note.isPending} onChange={(event) => setEditing({ ...editing, content: event.target.value })} />
                                    <div className="flex justify-end gap-2">
                                        <Button type="button" variant="ghost" size="sm" className="gap-1" disabled={note.isPending} onClick={() => setEditing(null)}>
                                            <X className="h-3.5 w-3.5" aria-hidden /> Cancelar
                                        </Button>
                                        <Button type="button" size="sm" disabled={note.isPending || !editing.content.trim()} onClick={() => note.mutate({ id: editing.id, content: editing.content.trim() }, { onSuccess: () => setEditing(null) })}>
                                            {note.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                                            Salvar
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <p className="whitespace-pre-wrap text-sm">{item.content}</p>
                            )}
                        </motion.li>
                    ))}
                </motion.ul>
            )}
            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
                title="Excluir a nota?"
                description="A exclusão fica registrada na auditoria."
                confirmLabel="Excluir"
                variant="destructive"
                pending={note.isPending}
                onConfirm={() => deleting && note.mutate({ id: deleting, remove: true }, { onSettled: () => setDeleting(null) })}
            />
        </div>
    )
}

// ── Anexos ─────────────────────────────────────────────────────────────────

export function AttachmentsSection({ work }: SectionProps) {
    const uploads = useBusinessUploads(work.businessId, "work")
    const files = useWorkAttachments(work.businessId, work.id)
    const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)
    const total = work.attachments.length + uploads.items.length
    const upload = async (list: File[]) => {
        const results = await Promise.all(list.slice(0, Math.max(0, WORK_ATTACHMENTS_MAX - total)).map((file) => uploads.upload(file)))
        const ids = results.flatMap((result) => (result.file ? [result.file.id] : []))
        if (!ids.length) return
        await files.add.mutateAsync(ids).then(
            () => uploads.reset(),
            () => undefined,
        )
    }
    return (
        <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Entregáveis do trabalho, com os limites de documentos da Plataforma. Anexos do trabalho não aparecem no link do cliente.</p>
            {work.attachments.length === 0 && !work.editable && <Empty icon={Paperclip}>Sem anexos.</Empty>}
            {work.attachments.length > 0 && (
                <ul className="space-y-1.5">
                    {work.attachments.map((file) => (
                        <li key={file.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                            <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                            <a href={withBasePath(file.url)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                                {file.name}
                            </a>
                            <span className="text-xs text-muted-foreground">{formatAttachmentSize(file.size)}</span>
                            {work.editable && <IconAction icon={X} label={`Remover ${file.name}`} tone="danger" onClick={() => setRemoving({ id: file.id, name: file.name })} />}
                        </li>
                    ))}
                </ul>
            )}
            {work.editable && (
                <UploadField
                    id="work-files"
                    multiple
                    disabled={files.add.isPending || total >= WORK_ATTACHMENTS_MAX}
                    uploads={uploads.items.filter((item) => item.status !== "done")}
                    onFiles={(list) => void upload(list)}
                    onRemoveUpload={uploads.remove}
                    hint={`Até ${WORK_ATTACHMENTS_MAX} anexos`}
                />
            )}
            <ConfirmDialog
                open={removing !== null}
                onOpenChange={(open) => !open && setRemoving(null)}
                title={`Remover "${removing?.name ?? ""}"?`}
                description="O arquivo é apagado do storage."
                confirmLabel="Remover"
                variant="destructive"
                pending={files.remove.isPending}
                onConfirm={() => removing && files.remove.mutate(removing.id, { onSettled: () => setRemoving(null) })}
            />
        </div>
    )
}

// ── Movimentações ──────────────────────────────────────────────────────────

export function MovesSection({ work }: SectionProps) {
    if (work.moves.length === 0) return <Empty icon={History}>Sem movimentações.</Empty>
    return (
        <motion.ol variants={listContainer} initial="hidden" animate="visible" className="relative space-y-4 border-l pl-5">
            {work.moves.map((move) => (
                <motion.li key={move.id} variants={listItem} className="relative">
                    <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" aria-hidden />
                    <p className="text-sm">{move.fromName ? `${move.fromName} → ${move.toName}` : `Criado em ${move.toName} pelo aceite do pedido`}</p>
                    <p className="text-xs text-muted-foreground">
                        {dateTime(move.at)} · {move.by === "client" ? "Cliente (link do orçamento)" : (move.actorName ?? "Usuário")}
                    </p>
                </motion.li>
            ))}
        </motion.ol>
    )
}

// ── Pagamento ──────────────────────────────────────────────────────────────

export function PaymentSection({ work, onEditPayment, onPay, onUnpay }: SectionProps) {
    const paid = work.column === "paid" && work.payment
    const { can } = usePermissions()
    const canPay = work.editable && can("works.payment")
    return (
        <div className="space-y-4">
            {paid ? (
                <div className="space-y-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
                    <p className="flex items-center gap-1.5 font-medium text-success">
                        <CheckCircle2 className="h-4 w-4" aria-hidden /> Pago em {dateKeyLabel(work.payment!.paidOn)}
                    </p>
                    <p>
                        Recebido <span className="font-mono font-semibold">{formatMoney(work.payment!.receivedCents, work.currency)}</span>
                        {work.payment!.method ? ` · ${work.payment!.method}` : ""}
                    </p>
                    {work.status === "archived" && <p className="text-xs text-warning">Arquivado: fora do faturamento enquanto estiver arquivado.</p>}
                    {canPay && (
                        <div className="flex flex-wrap gap-2 pt-1">
                            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onEditPayment}>
                                <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar pagamento
                            </Button>
                            <Button type="button" size="sm" variant="ghost" className="gap-1.5 text-destructive" onClick={onUnpay}>
                                <Undo2 className="h-3.5 w-3.5" aria-hidden /> Sair de Pago
                            </Button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-sm">
                    <p className="text-muted-foreground">Ainda não pago. Ao mover para Pago, informe a data, o valor recebido e a forma de pagamento.</p>
                    {canPay && (
                        <Button type="button" size="sm" className="gap-1.5" onClick={onPay}>
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Mover para Pago
                        </Button>
                    )}
                </div>
            )}
            {work.payments.length === 0 ? (
                <Empty icon={History}>Sem histórico de pagamento.</Empty>
            ) : (
                <motion.ol variants={listContainer} initial="hidden" animate="visible" className="relative space-y-4 border-l pl-5">
                    {work.payments.map((event, index) => (
                        <motion.li key={`${event.at}-${index}`} variants={listItem} className="relative">
                            <span className={`absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background ${event.kind === "unmarked" ? "bg-destructive" : "bg-success"}`} aria-hidden />
                            <p className="text-sm">{WORK_PAYMENT_EVENT_LABELS[event.kind]}</p>
                            <p className="text-xs text-muted-foreground">
                                {event.paidOn ? `${dateKeyLabel(event.paidOn)} · ` : ""}
                                {event.receivedCents !== null ? `${formatMoney(event.receivedCents, work.currency)} · ` : ""}
                                {event.method ? `${event.method} · ` : ""}
                                {dateTime(event.at)}
                                {event.actorName ? ` · ${event.actorName}` : ""}
                            </p>
                        </motion.li>
                    ))}
                </motion.ol>
            )}
        </div>
    )
}

