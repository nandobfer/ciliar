"use client"

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Eye, EyeOff, Loader2, Paperclip, Plus, RefreshCw, Sparkles, Trash2, UserPlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePicker } from "@/components/ui/date-picker"
import { Field } from "@/components/ui/field"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { FormFooter } from "@/components/ui/form-footer"
import { FORM_GRID } from "@/components/ui/form-grid"
import { IconAction } from "@/components/ui/icon-action"
import { Input } from "@/components/ui/input"
import { MoneyInput } from "@/components/ui/money-input"
import { SearchPicker } from "@/components/ui/search-picker"
import { Textarea } from "@/components/ui/textarea"
import { formatAttachmentSize } from "@/lib/attachments"
import { withBasePath } from "@/lib/base-path"
import { formatMoney } from "@/features/businesses/format"
import { currencySymbol } from "@/features/businesses/components/interview/InterviewAnswerControl"
import { UploadField } from "@/features/businesses/components/space/UploadField"
import { useBusinessUploads, useItemList } from "@/features/businesses/hooks/useBusinessSpace"
import type { BusinessDetailDto } from "@/features/businesses/types"
import { ORDER_ATTACHMENTS_MAX, ORDER_DESCRIPTION_MAX, ORDER_SUMMARY_MAX, ORDER_TITLE_MAX } from "../constants"
import { firstLine, formatMinutes, itemSubtotalCents, parseHoursInput, suggestedTotalCents } from "../logic"
import { clientCreateSchema, orderCreateSchema, orderUpdateSchema } from "../schemas"
import type { OrderDto } from "../types"
import { useClients, useRegenerateOrderTitle } from "../hooks/useOrders"

interface ItemDraft {
    key: string
    id?: string
    activityId: string
    activityName: string
    hourlyRateCents: number
    hours: string
}

interface AttachmentDraft {
    id: string
    name: string
    size: number
    url: string
    clientVisible: boolean
}

function draftOf(order: OrderDto | null) {
    return {
        clientId: order?.clientId ?? "",
        description: order?.description ?? "",
        title: order?.titleManual ? (order.title ?? "") : "",
        summary: order?.summaryManual ? (order.summary ?? "") : "",
        items: (order?.items ?? []).map<ItemDraft>((item) => ({ key: item.id, id: item.id, activityId: item.activityId, activityName: item.activityName, hourlyRateCents: item.hourlyRateCents, hours: formatMinutes(item.minutes) })),
        manualTotal: order?.totalManual ?? false,
        totalCents: order?.totalCents ?? 0,
        dueDate: order?.dueDate ?? "",
        attachments: (order?.attachments ?? []).map<AttachmentDraft>((file) => ({ id: file.id, name: file.name, size: file.size, url: file.url, clientVisible: file.clientVisible })),
    }
}
type Draft = ReturnType<typeof draftOf>

/**
 * Formulário do pedido (novo e edição, no padrão do formulário de serviços do Opex): cliente
 * (selecionar ou criar inline), necessidade, título/resumo (IA ou manual), itens com horas `h:mm` e o
 * valor/hora congelado, total sugerido ou ajustado, entrega e anexos com "visível ao cliente".
 * Somente leitura quando o pedido não é editável. O rascunho acompanha atualizações externas
 * enquanto não há alterações locais.
 */
export function OrderForm({
    business,
    order,
    readOnly,
    pending,
    onSubmit,
    onCancel,
}: {
    business: BusinessDetailDto
    order: OrderDto | null
    readOnly: boolean
    pending: boolean
    onSubmit: (data: Record<string, unknown>) => Promise<boolean>
    onCancel: () => void
}) {
    const reduceMotion = useReducedMotion()
    const clients = useClients()
    const activities = useItemList(business.id, "activities")
    const uploads = useBusinessUploads(business.id, "order")
    const [draft, setDraft] = useState<Draft>(() => draftOf(order))
    const [baseline, setBaseline] = useState<Draft>(() => draftOf(order))
    const [base, setBase] = useState(order?.version ?? -1)
    const [newClient, setNewClient] = useState<{ name: string; email: string; phone: string } | null>(null)
    const [uploadVisibility, setUploadVisibility] = useState<Record<string, boolean>>({})
    const [error, setError] = useState<string | null>(null)
    const dirty = JSON.stringify(draft) !== JSON.stringify(baseline) || Boolean(newClient) || uploads.items.length > 0
    const disabled = readOnly || pending

    // Atualização externa (tempo real/IA) sem alterações locais: acompanha a versão nova.
    useEffect(() => {
        if (order && order.version !== base && !dirty) {
            setDraft(draftOf(order))
            setBaseline(draftOf(order))
            setBase(order.version)
        }
    }, [order, base, dirty])

    const patch = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }))
    const activeClients = useMemo(() => (clients.data?.items ?? []).filter((client) => client.status === "active" || client.id === draft.clientId), [clients.data, draft.clientId])
    const selectedClient = (clients.data?.items ?? []).find((client) => client.id === draft.clientId)
    const activeActivities = (activities.data?.items ?? []).filter((activity) => activity.status === "active" && activity.active)
    const parsedItems = draft.items.map((item) => ({ ...item, minutes: parseHoursInput(item.hours) }))
    const suggested = suggestedTotalCents(parsedItems.map((item) => ({ minutes: item.minutes ?? 0, hourlyRateCents: item.hourlyRateCents })))
    const doneUploads = uploads.items.flatMap((item) => (item.status === "done" && item.file ? [item.file] : []))
    const attachmentTotal = draft.attachments.length + uploads.items.length

    const submit = async () => {
        const invalidHours = parsedItems.find((item) => item.minutes === null)
        if (invalidHours) return setError(`Horas de "${invalidHours.activityName}": use o formato h:mm (ex.: 2:30).`)
        if (newClient) {
            const parsed = clientCreateSchema.safeParse({ name: newClient.name, email: newClient.email.trim() || null, phone: newClient.phone.trim() || null })
            if (!parsed.success) return setError(parsed.error.issues[0]!.message)
        }
        const data: Record<string, unknown> = {
            ...(newClient ? { newClient: { name: newClient.name, email: newClient.email.trim() || null, phone: newClient.phone.trim() || null } } : draft.clientId ? { clientId: draft.clientId } : {}),
            description: draft.description,
            title: draft.title.trim() || null,
            summary: draft.summary.trim() || null,
            items: parsedItems.map((item) => (item.id ? { id: item.id, minutes: item.minutes } : { activityId: item.activityId, minutes: item.minutes })),
            totalOverrideCents: draft.manualTotal ? draft.totalCents : null,
            dueDate: draft.dueDate || null,
            attachments: [...draft.attachments.map((file) => ({ fileId: file.id, clientVisible: file.clientVisible })), ...doneUploads.map((file) => ({ fileId: file.id, clientVisible: uploadVisibility[file.id] ?? true }))],
        }
        const parsed = order ? orderUpdateSchema.safeParse({ ...data, version: base }) : orderCreateSchema.safeParse(data)
        if (!parsed.success) return setError(parsed.error.issues[0]!.message)
        setError(null)
        const saved = await onSubmit(order ? { ...data, version: base } : data)
        if (saved) {
            setBaseline(draft)
            uploads.reset()
            setNewClient(null)
            setUploadVisibility({})
        }
    }

    const cancel = () => {
        uploads.discard()
        setNewClient(null)
        setDraft(draftOf(order))
        setBaseline(draftOf(order))
        setBase(order?.version ?? -1)
        setError(null)
        onCancel()
    }

    return (
        <form
            className="space-y-6"
            noValidate
            onSubmit={(event) => {
                event.preventDefault()
                void submit()
            }}
        >
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Cliente e necessidade</CardTitle>
                    <CardDescription>O cliente é seu e serve a todos os negócios. Observações do cliente nunca aparecem no link.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <AnimatePresence mode="wait" initial={false}>
                        {newClient ? (
                            <motion.div key="new" initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3 rounded-lg border bg-muted/20 p-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium">Novo cliente</p>
                                    <IconAction icon={X} label="Escolher um cliente existente" onClick={() => setNewClient(null)} />
                                </div>
                                <Field id="order-new-client-name" label="Nome (pessoa ou empresa)">
                                    <Input id="order-new-client-name" autoFocus value={newClient.name} maxLength={160} disabled={disabled} onChange={(event) => setNewClient({ ...newClient, name: event.target.value })} />
                                </Field>
                                <div className={FORM_GRID}>
                                    <Field id="order-new-client-email" label="E-mail">
                                        <Input id="order-new-client-email" type="email" value={newClient.email} maxLength={200} disabled={disabled} onChange={(event) => setNewClient({ ...newClient, email: event.target.value })} />
                                    </Field>
                                    <Field id="order-new-client-phone" label="Telefone/WhatsApp">
                                        <Input id="order-new-client-phone" value={newClient.phone} maxLength={30} disabled={disabled} onChange={(event) => setNewClient({ ...newClient, phone: event.target.value })} />
                                    </Field>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div key="pick" initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                                <Field id="order-client" label="Cliente">
                                    <SearchPicker
                                        trigger={<FieldTrigger id="order-client" disabled={disabled} placeholder="Escolha o cliente" value={selectedClient ? `${selectedClient.name}${selectedClient.email ? ` · ${selectedClient.email}` : ""}` : undefined} />}
                                        items={activeClients}
                                        loading={clients.isLoading}
                                        disabled={disabled}
                                        getKey={(item) => item.id}
                                        searchKeys={["name", "email", "phone"]}
                                        renderItem={(item) => (
                                            <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                                                <span className="truncate text-sm">{item.name}</span>
                                                <span className="shrink-0 truncate text-xs text-muted-foreground">{item.email ?? item.phone ?? ""}</span>
                                            </span>
                                        )}
                                        onPick={(item) => patch({ clientId: item.id })}
                                        footer={
                                            <Button type="button" variant="ghost" size="sm" className="w-full justify-start gap-1.5" onClick={() => setNewClient({ name: "", email: "", phone: "" })}>
                                                <UserPlus className="h-4 w-4" aria-hidden /> Cadastrar novo cliente
                                            </Button>
                                        }
                                        matchTriggerWidth
                                        searchLabel="Buscar cliente"
                                        listLabel="Clientes"
                                        emptyText="Nenhum cliente cadastrado"
                                        emptySearchText="Nenhum cliente encontrado"
                                    />
                                </Field>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <Field id="order-description" label="Necessidade do cliente">
                        <Textarea id="order-description" rows={6} value={draft.description} maxLength={ORDER_DESCRIPTION_MAX} disabled={disabled} placeholder="Descreva o que o cliente precisa" onChange={(event) => patch({ description: event.target.value })} />
                    </Field>
                    <div className={FORM_GRID}>
                        <Field id="order-title" label="Título">
                            <Input id="order-title" value={draft.title} maxLength={ORDER_TITLE_MAX} disabled={disabled} placeholder={order?.title && !order.titleManual ? order.title : "A IA preenche automaticamente"} onChange={(event) => patch({ title: event.target.value })} />
                        </Field>
                        <Field id="order-summary" label="Resumo">
                            <Input id="order-summary" value={draft.summary} maxLength={ORDER_SUMMARY_MAX} disabled={disabled} placeholder={order?.summary && !order.summaryManual ? order.summary : "A IA preenche automaticamente"} onChange={(event) => patch({ summary: event.target.value })} />
                        </Field>
                    </div>
                    {order && <OrderAiPanel order={order} readOnly={readOnly} />}
                    {!order && draft.description.trim() && !draft.title.trim() && <p className="text-xs text-muted-foreground">Até a IA gerar, o título exibido é: “{firstLine(draft.description)}”.</p>}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Itens e valor</CardTitle>
                    <CardDescription>Só atividades ativas entram em novos itens; o valor/hora é copiado agora e não muda se a atividade mudar depois.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {draft.items.length > 0 && (
                        <ul className="space-y-2">
                            <AnimatePresence initial={false}>
                                {parsedItems.map((item, index) => (
                                    <motion.li key={item.key} layout={!reduceMotion} initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-center gap-2 rounded-md border px-3 py-2 sm:grid-cols-[minmax(0,1fr)_6rem_9rem_9rem_auto]">
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-medium">{item.activityName}</span>
                                            <span className="block text-xs text-muted-foreground sm:hidden">{formatMoney(item.hourlyRateCents, business.currency)}/h</span>
                                        </span>
                                        <Input
                                            aria-label={`Horas de ${item.activityName} (h:mm)`}
                                            value={item.hours}
                                            inputMode="numeric"
                                            placeholder="h:mm"
                                            disabled={disabled}
                                            aria-invalid={item.minutes === null}
                                            className="font-mono"
                                            onChange={(event) => patch({ items: draft.items.map((entry, position) => (position === index ? { ...entry, hours: event.target.value } : entry)) })}
                                        />
                                        <span className="hidden text-right font-mono text-xs text-muted-foreground sm:block">{formatMoney(item.hourlyRateCents, business.currency)}/h</span>
                                        <span className="hidden text-right font-mono text-sm sm:block">{formatMoney(itemSubtotalCents(item.minutes ?? 0, item.hourlyRateCents), business.currency)}</span>
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
                                    <span className="shrink-0 text-xs text-muted-foreground">{formatMoney(item.hourlyRateCents, business.currency)}/h</span>
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
                            <span className="text-muted-foreground">
                                Calculado ({formatMinutes(parsedItems.reduce((sum, item) => sum + (item.minutes ?? 0), 0))} h × valor/hora)
                            </span>
                            <span className="font-mono">{formatMoney(suggested, business.currency)}</span>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                            <Checkbox checked={draft.manualTotal} disabled={disabled} onCheckedChange={(value) => patch({ manualTotal: value === true, totalCents: value === true ? (draft.manualTotal ? draft.totalCents : suggested) : draft.totalCents })} />
                            Ajustar o valor total manualmente
                        </label>
                        {draft.manualTotal && (
                            <Field id="order-total" label="Valor total ajustado">
                                <MoneyInput id="order-total" prefix={currencySymbol(business.currency)} value={draft.totalCents / 100} disabled={disabled} onChange={(value) => patch({ totalCents: Math.round(value * 100) })} />
                            </Field>
                        )}
                        <p className="flex items-baseline justify-between text-base font-semibold" aria-live="polite">
                            <span>Valor total {draft.manualTotal && <span className="ml-1 rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning">ajustado</span>}</span>
                            <span className="font-mono">{formatMoney(draft.manualTotal ? draft.totalCents : suggested, business.currency)}</span>
                        </p>
                    </div>
                    <Field id="order-due" label="Data de entrega (prazo)">
                        <DatePicker id="order-due" value={draft.dueDate} onChange={(value) => patch({ dueDate: value })} inputDisabled={disabled} />
                    </Field>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Anexos</CardTitle>
                    <CardDescription>Briefing e referências (limites de documentos da Plataforma). Anexos ocultos não aparecem no link do cliente.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {(draft.attachments.length > 0 || doneUploads.length > 0) && (
                        <ul className="space-y-1.5">
                            {[...draft.attachments.map((file) => ({ ...file, kind: "kept" as const })), ...doneUploads.map((file) => ({ id: file.id, name: file.name, size: file.size, url: file.url, clientVisible: uploadVisibility[file.id] ?? true, kind: "new" as const }))].map((file) => (
                                <li key={file.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                    <a href={withBasePath(file.url)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                                        {file.name}
                                    </a>
                                    <span className="text-xs text-muted-foreground">{formatAttachmentSize(file.size)}</span>
                                    <IconAction
                                        icon={file.clientVisible ? Eye : EyeOff}
                                        label={file.clientVisible ? `${file.name}: visível ao cliente (ocultar)` : `${file.name}: oculto do cliente (mostrar)`}
                                        disabledReason={disabled ? "Somente leitura" : null}
                                        onClick={() =>
                                            file.kind === "kept"
                                                ? patch({ attachments: draft.attachments.map((entry) => (entry.id === file.id ? { ...entry, clientVisible: !entry.clientVisible } : entry)) })
                                                : setUploadVisibility((current) => ({ ...current, [file.id]: !(current[file.id] ?? true) }))
                                        }
                                    />
                                    {!disabled && file.kind === "kept" && <IconAction icon={X} label={`Remover ${file.name}`} tone="danger" onClick={() => patch({ attachments: draft.attachments.filter((entry) => entry.id !== file.id) })} />}
                                    {!disabled && file.kind === "new" && <IconAction icon={X} label={`Remover ${file.name}`} tone="danger" onClick={() => uploads.remove(uploads.items.find((entry) => entry.file?.id === file.id)!.localId)} />}
                                </li>
                            ))}
                        </ul>
                    )}
                    {!readOnly && (
                        <UploadField
                            id="order-files"
                            multiple
                            disabled={disabled || attachmentTotal >= ORDER_ATTACHMENTS_MAX}
                            uploads={uploads.items.filter((item) => item.status !== "done")}
                            onFiles={(files) => {
                                for (const file of files.slice(0, ORDER_ATTACHMENTS_MAX - attachmentTotal)) void uploads.upload(file)
                            }}
                            onRemoveUpload={uploads.remove}
                            hint={`Até ${ORDER_ATTACHMENTS_MAX} anexos; visíveis ao cliente por padrão`}
                        />
                    )}
                    {readOnly && !draft.attachments.length && <p className="text-sm text-muted-foreground">Sem anexos.</p>}
                </CardContent>
            </Card>

            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            {!readOnly && (
                <FormFooter>
                    {uploads.busy && (
                        <p role="status" className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Enviando anexos…
                        </p>
                    )}
                    <Button type="button" variant="ghost" disabled={pending || (Boolean(order) && !dirty)} onClick={cancel}>
                        {order ? "Descartar" : "Cancelar"}
                    </Button>
                    <Button type="submit" disabled={pending || uploads.busy || (Boolean(order) && !dirty)}>
                        {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                        {order ? (order.firstSentAt ? "Salvar nova versão" : "Salvar") : "Criar pedido"}
                    </Button>
                </FormFooter>
            )}
        </form>
    )
}

/** Título/resumo por IA com o estado da geração e "Gerar novamente" (o manual prevalece). */
function OrderAiPanel({ order, readOnly }: { order: OrderDto; readOnly: boolean }) {
    const reduceMotion = useReducedMotion()
    const regenerate = useRegenerateOrderTitle(order.businessId, order.id)
    const allManual = order.titleManual && order.summaryManual
    return (
        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
                    Título e resumo por IA
                </span>
                {!readOnly && !allManual && (
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => regenerate.mutate()} disabled={regenerate.isPending || order.aiStatus === "pending"}>
                        {regenerate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
                        Gerar novamente
                    </Button>
                )}
            </div>
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={order.aiStatus} initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }} transition={{ duration: 0.2 }}>
                    {allManual ? (
                        <p className="text-sm text-muted-foreground">Título e resumo definidos manualmente. Apague um deles para a IA gerar.</p>
                    ) : order.aiStatus === "pending" ? (
                        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Gerando título e resumo…
                        </p>
                    ) : order.aiStatus === "error" ? (
                        <p className="text-sm text-destructive">{order.aiError ?? "Não foi possível gerar o título por IA."}</p>
                    ) : order.aiStatus === "done" ? (
                        <div className="space-y-1">
                            {order.title && <p className="text-sm font-medium">{order.title}</p>}
                            {order.summary && <p className="text-sm text-muted-foreground">{order.summary}</p>}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">Sem título gerado: exibindo a primeira linha da descrição.</p>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    )
}
