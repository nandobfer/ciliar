"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Paperclip, Plus, Trophy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { withBasePath } from "@/lib/base-path"
import { ITEM_DESCRIPTION_MAX, SUCCESS_ATTACHMENTS_MAX, SUCCESS_RESULT_MAX } from "../../constants"
import { successCreateSchema } from "../../space-schemas"
import type { SuccessDto } from "../../types"
import { useBusinessUploads, useItemList, useSaveItem } from "../../hooks/useBusinessSpace"
import { useBusinessSpace } from "./BusinessSpaceLayout"
import { ArchivedNote, ItemStatusSelect, matchesSearch, useItemFilters, useItemRowActions } from "./item-ui"
import { UploadField } from "./UploadField"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { SearchPicker } from "@/components/ui/search-picker"
import { useClients } from "@/features/orders/hooks/useOrders"

const dateLabel = (key: string) => key.split("-").reverse().join("/")

/** Sucessos (cases/conquistas) do negócio, com resultado/métrica e anexos. */
export function SuccessesPage() {
    const { business, editable } = useBusinessSpace()
    const reduceMotion = useReducedMotion()
    const query = useItemList(business.id, "successes")
    const filters = useItemFilters()
    const [editor, setEditor] = useState<SuccessDto | "new" | null>(null)
    const rows = useItemRowActions(business.id, "successes", "Sucesso", "O sucesso some das listas e do portfólio. Ele é excluído definitivamente (com os anexos) depois do prazo configurado; até lá, pode ser restaurado.")
    const canEdit = editable && (query.data?.editable ?? false)
    const items = (query.data?.items ?? []).filter((item) => filters.matchesStatus(item) && matchesSearch(filters.search, item.title, item.result, item.description))

    return (
        <>
            <CadastroHeader title="Sucessos" description="Cases e conquistas do negócio" actionLabel={canEdit ? "Novo sucesso" : undefined} actionIcon={<Plus className="h-4 w-4" />} onAction={() => setEditor("new")} />
            <ListFilters total={items.length} search={{ value: filters.search, onChange: filters.setSearch, placeholder: "Buscar por título, resultado ou descrição", label: "Buscar sucessos" }} onClear={filters.clear}>
                <FilterGroup label="Situação" className="min-w-[180px] flex-1">
                    <ItemStatusSelect selected={filters.status} onSelect={filters.setStatus} />
                </FilterGroup>
            </ListFilters>
            {query.isPending ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-40" />)}</div>
            ) : query.isError ? (
                <ErrorState title="Não foi possível carregar os sucessos" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : !items.length ? (
                <EmptyState icon={Trophy} title={query.data.items.length ? "Nenhum sucesso encontrado." : "Nenhum sucesso cadastrado."} description={query.data.items.length ? undefined : "Registre os resultados que você conquistou para os seus clientes."} actionLabel={canEdit && !query.data.items.length ? "Novo sucesso" : undefined} onAction={() => setEditor("new")} />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {items.map((item, index) => (
                        <motion.div key={item.id} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : index * 0.03 }}>
                            <Card className="flex h-full flex-col gap-2 p-4">
                                <div className="min-w-0">
                                    <p className="font-semibold">{item.title}</p>
                                    {item.date && <p className="text-xs text-muted-foreground">{dateLabel(item.date)}</p>}
                                </div>
                                {item.result && <p className="rounded-md bg-primary/10 px-2 py-1 text-sm font-medium text-primary">{item.result}</p>}
                                {item.description && <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">{item.description}</p>}
                                {item.attachments.length > 0 && (
                                    <ul className="space-y-1">
                                        {item.attachments.map((file) => (
                                            <li key={file.id}>
                                                <a href={withBasePath(file.url)} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-xs text-primary hover:underline">
                                                    <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                                    <span className="truncate">{file.name}</span>
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <ArchivedNote item={item} />
                                <div className="mt-auto">{rows.actions({ ...item, name: item.title }, { editable: canEdit, onEdit: () => setEditor(item) })}</div>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            )}
            {editor && <SuccessDialog key={editor === "new" ? "new" : editor.id} success={editor === "new" ? null : editor} onClose={() => setEditor(null)} />}
            {rows.dialog}
        </>
    )
}

/** Pré-preenchimento do "Converter em Sucesso" (M4): título, data e cliente do trabalho, ligado a ele. */
export interface SuccessPreset {
    title: string
    date: string | null
    clientId: string | null
    workId: string
    workCode: string
}

export function SuccessDialog({ success, preset, onClose, onSaved }: { success: SuccessDto | null; preset?: SuccessPreset; onClose: () => void; onSaved?: (success: SuccessDto) => void }) {
    const { business } = useBusinessSpace()
    const save = useSaveItem(business.id, "successes")
    const uploads = useBusinessUploads(business.id, "success")
    const [title, setTitle] = useState(success?.title ?? preset?.title ?? "")
    const [date, setDate] = useState(success?.date ?? preset?.date ?? "")
    const [result, setResult] = useState(success?.result ?? "")
    const [description, setDescription] = useState(success?.description ?? "")
    const [kept, setKept] = useState(success?.attachments ?? [])
    const [clientId, setClientId] = useState(success?.clientId ?? preset?.clientId ?? "")
    const clients = useClients()
    const client = clients.data?.items.find((item) => item.id === clientId)
    const [error, setError] = useState<string | null>(null)
    const added = uploads.items.flatMap((item) => (item.status === "done" && item.file ? [item.file.id] : []))
    const total = kept.length + uploads.items.length

    const close = () => {
        if (save.isPending) return
        uploads.discard()
        onClose()
    }

    const submit = async () => {
        const parsed = successCreateSchema.safeParse({ title, date: date || null, result: result.trim() || null, description: description.trim() || null, attachmentIds: [...kept.map((file) => file.id), ...added], clientId: clientId || null, ...(preset && !success ? { workId: preset.workId } : {}) })
        if (!parsed.success) return setError(parsed.error.issues[0]!.message)
        setError(null)
        await save.mutateAsync({ id: success?.id, data: success ? { ...parsed.data, version: success.version } : parsed.data }).then((saved) => { uploads.reset(); onSaved?.(saved); onClose() }, () => undefined)
    }

    return (
        <Dialog open onOpenChange={(open) => !open && close()}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{success ? "Editar sucesso" : preset ? `Converter ${preset.workCode} em sucesso` : "Novo sucesso"}</DialogTitle>
                    <DialogDescription>{preset && !success ? "O sucesso fica ligado ao trabalho e ao cliente. " : ""}Imagens e anexos seguem os limites de documentos da Plataforma.</DialogDescription>
                </DialogHeader>
                <form className="space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); void submit() }}>
                    <div className={FORM_GRID}>
                        <Field id="success-title" label="Título">
                            <Input id="success-title" autoFocus value={title} maxLength={160} disabled={save.isPending} onChange={(event) => setTitle(event.target.value)} />
                        </Field>
                        <Field id="success-date" label="Data">
                            <DatePicker id="success-date" value={date} onChange={setDate} inputDisabled={save.isPending} />
                        </Field>
                    </div>
                    <Field id="success-client" label="Cliente (opcional)">
                        <SearchPicker
                            trigger={<FieldTrigger id="success-client" disabled={save.isPending} placeholder="Sem cliente" value={client?.name} />}
                            items={(clients.data?.items ?? []).filter((item) => item.status === "active" || item.id === clientId)}
                            loading={clients.isLoading}
                            getKey={(item) => item.id}
                            searchKeys={["name", "email"]}
                            renderItem={(item) => <span className="truncate text-sm">{item.name}</span>}
                            onPick={(item) => setClientId(item.id)}
                            footer={
                                <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={() => setClientId("")}>
                                    Sem cliente
                                </Button>
                            }
                            matchTriggerWidth
                            searchLabel="Buscar cliente"
                            listLabel="Clientes"
                            emptyText="Nenhum cliente cadastrado"
                            emptySearchText="Nenhum cliente encontrado"
                        />
                    </Field>
                    <Field id="success-result" label="Resultado/métrica">
                        <Input id="success-result" value={result} maxLength={SUCCESS_RESULT_MAX} placeholder="Ex.: aumentou as vendas em 30%" disabled={save.isPending} onChange={(event) => setResult(event.target.value)} />
                    </Field>
                    <Field id="success-description" label="Descrição">
                        <Textarea id="success-description" rows={4} value={description} maxLength={ITEM_DESCRIPTION_MAX} disabled={save.isPending} onChange={(event) => setDescription(event.target.value)} />
                    </Field>
                    <Field id="success-files" label={`Imagens e anexos (até ${SUCCESS_ATTACHMENTS_MAX})`}>
                        <UploadField
                            id="success-files"
                            multiple
                            disabled={save.isPending || total >= SUCCESS_ATTACHMENTS_MAX}
                            uploads={uploads.items}
                            onFiles={(files) => { for (const file of files.slice(0, SUCCESS_ATTACHMENTS_MAX - total)) void uploads.upload(file) }}
                            onRemoveUpload={uploads.remove}
                            existing={kept}
                            onRemoveExisting={(fileId) => setKept((current) => current.filter((file) => file.id !== fileId))}
                        />
                    </Field>
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={save.isPending} onClick={close}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={save.isPending || uploads.busy}>
                            {save.isPending ? "Salvando..." : success ? "Salvar" : "Criar sucesso"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
