"use client"

import { useState, type ReactNode } from "react"
import { format } from "date-fns"
import { Archive, ArchiveRestore, PackageCheck } from "lucide-react"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { TableAction } from "@/components/list/TableAction"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { IconAction } from "@/components/ui/icon-action"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { BusinessItemKind } from "../../constants"
import { useItemAction } from "../../hooks/useBusinessSpace"

/** Peças comuns às listas do espaço (atividades, metas, documentos e sucessos). */

export type ItemStatusFilter = "active" | "archived"

export interface ItemLike {
    id: string
    status: "active" | "archived"
    archivedAt: string | null
    purgeAt: string | null
}

export function useItemFilters() {
    const [search, setSearch] = useState("")
    const [status, setStatus] = useState<ItemStatusFilter[]>(["active"])
    const matchesStatus = (item: ItemLike) => !status.length || status.includes(item.status)
    const clear = () => {
        setSearch("")
        setStatus(["active"])
    }
    return { search, setSearch, status, setStatus, matchesStatus, clear }
}

export const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR")
export const matchesSearch = (search: string, ...values: (string | null | undefined)[]) => !search.trim() || values.some((value) => value && normalize(value).includes(normalize(search.trim())))

export function ItemStatusSelect({ selected, onSelect }: { selected: ItemStatusFilter[]; onSelect: (values: ItemStatusFilter[]) => void }) {
    return (
        <CadastroMultiSelect
            aria-label="Situação"
            icon={PackageCheck}
            placeholder="Todos"
            selected={selected}
            onSelect={(values) => onSelect(values as ItemStatusFilter[])}
            options={[
                { value: "active", label: "Ativos" },
                { value: "archived", label: "Arquivados" },
            ]}
        />
    )
}

/** Arquivado em … · exclusão definitiva automática em … */
export function ArchivedNote({ item, className }: { item: Omit<ItemLike, "status"> & { status: string }; className?: string }) {
    if (item.status !== "archived" || !item.archivedAt) return null
    return (
        <span className={cn("block text-xs text-warning", className)}>
            Arquivado em {format(new Date(item.archivedAt), "dd/MM/yyyy")}
            {item.purgeAt ? ` · exclusão automática em ${format(new Date(item.purgeAt), "dd/MM/yyyy")}` : ""}
        </span>
    )
}

type Pending = { kind: "archive" | "delete"; id: string; name: string } | null

/**
 * Ações de linha (ver, editar, arquivar/restaurar, excluir definitivamente o arquivado) com as
 * confirmações: arquivar explica o prazo; excluir exige marcar "Entendo que é irreversível".
 */
export function useItemRowActions(businessId: string, kind: BusinessItemKind, label: string, archiveHint: string) {
    const action = useItemAction(businessId, kind, label)
    const [pending, setPending] = useState<Pending>(null)
    const [understood, setUnderstood] = useState(false)

    const actions = (item: ItemLike & { name: string }, options: { editable: boolean; onView?: () => void; onEdit?: () => void }): ReactNode => (
        <div className="flex justify-end gap-1" role="group" aria-label={`Ações de ${item.name}`}>
            {options.onView && <TableAction type="visualize" onClick={options.onView} />}
            {options.editable && item.status === "active" && options.onEdit && <TableAction type="edit" onClick={options.onEdit} />}
            {options.editable && item.status === "active" && <IconAction icon={Archive} label="Arquivar" busy={action.isPending} onClick={() => setPending({ kind: "archive", id: item.id, name: item.name })} />}
            {options.editable && item.status === "archived" && <IconAction icon={ArchiveRestore} label="Restaurar" busy={action.isPending} onClick={() => action.mutate({ id: item.id, action: "restore" })} />}
            {options.editable && item.status === "archived" && (
                <TableAction
                    type="delete"
                    disabled={action.isPending}
                    onClick={() => {
                        setUnderstood(false)
                        setPending({ kind: "delete", id: item.id, name: item.name })
                    }}
                />
            )}
        </div>
    )

    const dialog = (
        <ConfirmDialog
            open={pending !== null}
            onOpenChange={(open) => !open && setPending(null)}
            title={pending?.kind === "delete" ? `Excluir definitivamente "${pending.name}"?` : `Arquivar "${pending?.name ?? ""}"?`}
            description={pending?.kind === "delete" ? "Esta ação é irreversível: o item e os dados ligados a ele são apagados agora." : archiveHint}
            confirmLabel={pending?.kind === "delete" ? "Excluir definitivamente" : "Arquivar"}
            variant={pending?.kind === "delete" ? "destructive" : "default"}
            pending={action.isPending}
            onConfirm={() => {
                if (!pending || (pending.kind === "delete" && !understood)) return
                action.mutate({ id: pending.id, action: pending.kind }, { onSettled: () => setPending(null) })
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

/** Tabela no padrão das listas do app (cabeçalho fixo, linhas viram cartões no celular). */
export function ItemTable({ label, head, children }: { label: string; head: { label: string; className?: string }[]; children: ReactNode }) {
    return (
        <div className="overflow-x-auto rounded-md border bg-card max-md:border-0">
            <table className="w-full table-fixed caption-bottom text-sm max-md:block" aria-label={label}>
                <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--color-border)] max-md:hidden">
                    <tr>
                        {head.map((column) => (
                            <th key={column.label} className={cn("h-10 px-3 text-left align-middle text-xs font-semibold text-muted-foreground", column.className)}>
                                {column.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="max-md:block">{children}</tbody>
            </table>
        </div>
    )
}

export const ROW_CLASS =
    "border-b transition-colors last:border-0 hover:bg-muted/50 max-md:mb-3 max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-2 max-md:gap-y-1 max-md:rounded-lg max-md:border max-md:p-3 max-md:last:mb-0"
export const CELL_CLASS = "px-3 py-2 max-md:px-0 max-md:py-0"

/** Campo de categoria: texto livre com as categorias já usadas no negócio como sugestão. */
export function CategoryInput({ id, value, onChange, suggestions, disabled }: { id: string; value: string; onChange: (value: string) => void; suggestions: readonly string[]; disabled?: boolean }) {
    return (
        <>
            <Input id={id} list={`${id}-options`} value={value} maxLength={60} disabled={disabled} autoComplete="off" placeholder="Ex.: Consultoria" onChange={(event) => onChange(event.target.value)} />
            <datalist id={`${id}-options`}>
                {suggestions.map((option) => (
                    <option key={option} value={option} />
                ))}
            </datalist>
        </>
    )
}
