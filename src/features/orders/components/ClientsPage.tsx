"use client"

import { useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"
import { Archive, ArchiveRestore, Briefcase, Contact, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { IconAction } from "@/components/ui/icon-action"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
import { ArchivedNote, CELL_CLASS, ItemStatusSelect, ItemTable, matchesSearch, ROW_CLASS, type ItemStatusFilter } from "@/features/businesses/components/space/item-ui"
import { CLIENT_NOTES_MAX, clientPath } from "../constants"
import { clientCreateSchema } from "../schemas"
import type { ClientDto, CurrencyTotalsDto } from "../types"
import { useClientAction, useClients, useSaveClient } from "../hooks/useOrders"

/**
 * Clientes (`/clientes`): do usuário, usados em todos os negócios. Busca, filtro por negócio (onde o
 * cliente tem pedidos) e situação; criar/editar em diálogo; arquivar, restaurar e excluir
 * definitivamente (só arquivado e sem pedidos).
 */
export function ClientsPage() {
    const router = useRouter()
    const reduceMotion = useReducedMotion()
    const query = useClients()
    const businesses = useBusinesses()
    const [search, setSearch] = useState("")
    const [status, setStatus] = useState<ItemStatusFilter[]>(["active"])
    const [businessFilter, setBusinessFilter] = useState<string[]>([])
    const [editor, setEditor] = useState<ClientDto | "new" | null>(null)
    const rows = useClientRowActions()
    const canEdit = query.data?.editable ?? false
    const items = (query.data?.items ?? []).filter(
        (client) => (!status.length || status.includes(client.status)) && (!businessFilter.length || client.businessIds.some((id) => businessFilter.includes(id))) && matchesSearch(search, client.name, client.email, client.phone),
    )
    const clear = () => {
        setSearch("")
        setStatus(["active"])
        setBusinessFilter([])
    }

    return (
        <>
            <CadastroHeader title="Clientes" description="Seus clientes, usados em todos os negócios" actionLabel={canEdit ? "Novo cliente" : undefined} actionIcon={<Plus className="h-4 w-4" />} onAction={() => setEditor("new")} />
            <ListFilters total={items.length} search={{ value: search, onChange: setSearch, placeholder: "Buscar por nome, e-mail ou telefone", label: "Buscar clientes" }} onClear={clear}>
                <FilterGroup label="Negócio" className="min-w-[180px] flex-1">
                    <CadastroMultiSelect aria-label="Negócio" icon={Briefcase} placeholder="Todos" searchable selected={businessFilter} onSelect={setBusinessFilter} options={(businesses.data?.items ?? []).map((business) => ({ value: business.id, label: business.name }))} />
                </FilterGroup>
                <FilterGroup label="Situação" className="min-w-[180px] flex-1">
                    <ItemStatusSelect selected={status} onSelect={setStatus} />
                </FilterGroup>
            </ListFilters>
            {query.isPending ? (
                <CadastroTableSkeleton columns={5} rows={5} />
            ) : query.isError ? (
                <ErrorState title="Não foi possível carregar os clientes" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : !items.length ? (
                <EmptyState icon={Contact} title={query.data.items.length ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado."} description={query.data.items.length ? undefined : "Cadastre aqui ou direto no novo pedido."} actionLabel={canEdit && !query.data.items.length ? "Novo cliente" : undefined} onAction={() => setEditor("new")} />
            ) : (
                <ItemTable label="Clientes" head={[{ label: "Nome", className: "min-w-[180px]" }, { label: "Contato", className: "hidden md:table-cell" }, { label: "Pedidos", className: "w-24" }, { label: "Total aceito", className: "w-44" }, { label: "Ações", className: "w-44 text-right" }]}>
                    {items.map((client) => (
                        <motion.tr key={client.id} initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} className={ROW_CLASS}>
                            <td className={`${CELL_CLASS} max-md:w-full`}>
                                <span className="block truncate font-medium" title={client.name}>
                                    {client.name}
                                </span>
                                <ArchivedNote item={client} />
                            </td>
                            <td className={`${CELL_CLASS} hidden truncate text-xs text-muted-foreground md:table-cell`}>{[client.email, client.phone].filter(Boolean).join(" · ") || "—"}</td>
                            <td className={`${CELL_CLASS} text-sm`}>{client.orderCount}</td>
                            <td className={`${CELL_CLASS} text-sm`}>
                                <CurrencyTotals totals={client.totals} field="acceptedCents" />
                            </td>
                            <td className={`${CELL_CLASS} max-md:ml-auto`}>{rows.actions(client, { editable: canEdit, onView: () => router.push(clientPath(client.id)), onEdit: () => setEditor(client) })}</td>
                        </motion.tr>
                    ))}
                </ItemTable>
            )}
            {editor && <ClientDialog key={editor === "new" ? "new" : editor.id} client={editor === "new" ? null : editor} onClose={() => setEditor(null)} />}
            {rows.dialog}
        </>
    )
}

/** Totais separados por moeda (sem somar moedas diferentes). */
export function CurrencyTotals({ totals, field }: { totals: CurrencyTotalsDto[]; field: "acceptedCents" | "openCents" }) {
    const values = totals.filter((total) => total[field] > 0)
    if (!values.length) return <span className="text-muted-foreground">—</span>
    return (
        <span className="flex flex-col font-mono">
            {values.map((total) => (
                <span key={total.currency}>{formatMoney(total[field], total.currency)}</span>
            ))}
        </span>
    )
}

type Pending = { kind: "archive" | "delete"; client: ClientDto } | null

export function useClientRowActions() {
    const action = useClientAction()
    const [pending, setPending] = useState<Pending>(null)
    const [understood, setUnderstood] = useState(false)
    const actions = (client: ClientDto, options: { editable: boolean; onView?: () => void; onEdit?: () => void }): ReactNode => (
        <div className="flex justify-end gap-1" role="group" aria-label={`Ações de ${client.name}`}>
            {options.onView && <TableAction type="visualize" onClick={options.onView} />}
            {options.editable && client.status === "active" && options.onEdit && <TableAction type="edit" onClick={options.onEdit} />}
            {options.editable && client.status === "active" && <IconAction icon={Archive} label="Arquivar" busy={action.isPending} onClick={() => setPending({ kind: "archive", client })} />}
            {options.editable && client.status === "archived" && <IconAction icon={ArchiveRestore} label="Restaurar" busy={action.isPending} onClick={() => action.mutate({ id: client.id, action: "restore" })} />}
            {options.editable && client.status === "archived" && client.orderCount === 0 && (
                <TableAction
                    type="delete"
                    disabled={action.isPending}
                    onClick={() => {
                        setUnderstood(false)
                        setPending({ kind: "delete", client })
                    }}
                />
            )}
        </div>
    )
    const dialog = (
        <ConfirmDialog
            open={pending !== null}
            onOpenChange={(open) => !open && setPending(null)}
            title={pending?.kind === "delete" ? `Excluir definitivamente "${pending.client.name}"?` : `Arquivar "${pending?.client.name ?? ""}"?`}
            description={
                pending?.kind === "delete"
                    ? "Esta ação é irreversível: o cliente é apagado agora."
                    : pending?.client.orderCount
                      ? "O cliente some das listas e de novos pedidos. Como tem pedidos, ele fica arquivado (nunca é excluído definitivamente); pode ser restaurado."
                      : "O cliente some das listas e de novos pedidos. Ele é excluído definitivamente depois do prazo configurado; até lá, pode ser restaurado."
            }
            confirmLabel={pending?.kind === "delete" ? "Excluir definitivamente" : "Arquivar"}
            variant={pending?.kind === "delete" ? "destructive" : "default"}
            pending={action.isPending}
            onConfirm={() => {
                if (!pending || (pending.kind === "delete" && !understood)) return
                action.mutate({ id: pending.client.id, action: pending.kind }, { onSettled: () => setPending(null) })
            }}
        >
            {pending?.kind === "delete" && (
                <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={understood} onCheckedChange={(value) => setUnderstood(value === true)} />
                    Entendo que a exclusão é irreversível
                </label>
            )}
        </ConfirmDialog>
    )
    return { actions, dialog }
}

export function ClientDialog({ client, onClose }: { client: ClientDto | null; onClose: () => void }) {
    const save = useSaveClient()
    const [name, setName] = useState(client?.name ?? "")
    const [email, setEmail] = useState(client?.email ?? "")
    const [phone, setPhone] = useState(client?.phone ?? "")
    const [notes, setNotes] = useState(client?.notes ?? "")
    const [error, setError] = useState<string | null>(null)

    const submit = async () => {
        const parsed = clientCreateSchema.safeParse({ name, email: email.trim() || null, phone: phone.trim() || null, notes: notes.trim() || null })
        if (!parsed.success) return setError(parsed.error.issues[0]!.message)
        setError(null)
        await save.mutateAsync({ id: client?.id, data: client ? { ...parsed.data, version: client.version } : parsed.data }).then(onClose, () => undefined)
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{client ? "Editar cliente" : "Novo cliente"}</DialogTitle>
                    <DialogDescription>O e-mail é necessário para enviar o orçamento por e-mail. As observações são privadas.</DialogDescription>
                </DialogHeader>
                <form
                    className="space-y-4"
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault()
                        void submit()
                    }}
                >
                    <Field id="client-name" label="Nome (pessoa ou empresa)">
                        <Input id="client-name" autoFocus value={name} maxLength={160} disabled={save.isPending} onChange={(event) => setName(event.target.value)} />
                    </Field>
                    <div className={FORM_GRID}>
                        <Field id="client-email" label="E-mail">
                            <Input id="client-email" type="email" value={email} maxLength={200} disabled={save.isPending} onChange={(event) => setEmail(event.target.value)} />
                        </Field>
                        <Field id="client-phone" label="Telefone/WhatsApp">
                            <Input id="client-phone" value={phone} maxLength={30} disabled={save.isPending} onChange={(event) => setPhone(event.target.value)} />
                        </Field>
                    </div>
                    <Field id="client-notes" label="Observações (privadas, nunca aparecem no link do cliente)">
                        <Textarea id="client-notes" rows={4} value={notes} maxLength={CLIENT_NOTES_MAX} disabled={save.isPending} onChange={(event) => setNotes(event.target.value)} />
                    </Field>
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
                            {save.isPending ? "Salvando..." : client ? "Salvar" : "Criar cliente"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
