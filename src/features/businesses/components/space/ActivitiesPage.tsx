"use client"

import { useState } from "react"
import { format } from "date-fns"
import { motion, useReducedMotion } from "framer-motion"
import { Clock, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { MoneyInput } from "@/components/ui/money-input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { CadastroTableSkeleton } from "@/components/list/CadastroTableSkeleton"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { StatusPill } from "@/components/list/StatusPill"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { ITEM_DESCRIPTION_MAX } from "../../constants"
import { formatMoney } from "../../format"
import { activityCreateSchema } from "../../space-schemas"
import type { ActivityDto } from "../../types"
import { useActivityDetail, useCategories, useItemList, useSaveItem } from "../../hooks/useBusinessSpace"
import { currencySymbol } from "../interview/InterviewAnswerControl"
import { useBusinessSpace } from "./BusinessSpaceLayout"
import { ArchivedNote, CategoryInput, CELL_CLASS, ItemStatusSelect, ItemTable, matchesSearch, ROW_CLASS, useItemFilters, useItemRowActions } from "./item-ui"

/** Atividades do negócio: valor por hora com histórico, categoria sugerida e ativa/inativa. */
export function ActivitiesPage() {
    const { business, editable } = useBusinessSpace()
    const reduceMotion = useReducedMotion()
    const query = useItemList(business.id, "activities")
    const filters = useItemFilters()
    const [editor, setEditor] = useState<ActivityDto | "new" | null>(null)
    const [viewing, setViewing] = useState<string | null>(null)
    const rows = useItemRowActions(business.id, "activities", "Atividade", "A atividade some das listas e de novos pedidos. Ela é excluída definitivamente depois do prazo configurado; até lá, pode ser restaurada. Pedidos e trabalhos existentes mantêm o valor da época.")
    const canEdit = editable && (query.data?.editable ?? false)
    const items = (query.data?.items ?? []).filter((item) => filters.matchesStatus(item) && matchesSearch(filters.search, item.name, item.category, item.description))

    return (
        <>
            <CadastroHeader title="Atividades" description={`Serviços e valor por hora (${business.currency})`} actionLabel={canEdit ? "Nova atividade" : undefined} actionIcon={<Plus className="h-4 w-4" />} onAction={() => setEditor("new")} />
            <ListFilters total={items.length} search={{ value: filters.search, onChange: filters.setSearch, placeholder: "Buscar por nome, categoria ou descrição", label: "Buscar atividades" }} onClear={filters.clear}>
                <FilterGroup label="Situação" className="min-w-[180px] flex-1">
                    <ItemStatusSelect selected={filters.status} onSelect={filters.setStatus} />
                </FilterGroup>
            </ListFilters>
            {query.isPending ? (
                <CadastroTableSkeleton columns={5} rows={5} />
            ) : query.isError ? (
                <ErrorState title="Não foi possível carregar as atividades" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : !items.length ? (
                <EmptyState icon={Clock} title={query.data.items.length ? "Nenhuma atividade encontrada." : "Nenhuma atividade cadastrada."} description={query.data.items.length ? undefined : "Cadastre os serviços que você presta e o valor por hora de cada um."} actionLabel={canEdit && !query.data.items.length ? "Nova atividade" : undefined} onAction={() => setEditor("new")} />
            ) : (
                <ItemTable label="Atividades" head={[{ label: "Nome", className: "min-w-[160px]" }, { label: "Categoria", className: "hidden md:table-cell" }, { label: "Valor por hora", className: "w-40" }, { label: "Situação", className: "w-44" }, { label: "Ações", className: "w-40 text-right" }]}>
                    {items.map((item) => (
                        <motion.tr key={item.id} initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} className={ROW_CLASS}>
                            <td className={`${CELL_CLASS} max-md:w-full`}>
                                <span className="block truncate font-medium" title={item.name}>{item.name}</span>
                                {item.category && <span className="block truncate text-xs text-muted-foreground md:hidden">{item.category}</span>}
                            </td>
                            <td className={`${CELL_CLASS} hidden truncate text-xs text-muted-foreground md:table-cell`}>{item.category ?? "—"}</td>
                            <td className={`${CELL_CLASS} font-mono text-sm`}>{formatMoney(item.hourlyRateCents, business.currency)}</td>
                            <td className={CELL_CLASS}>
                                <StatusPill active={item.active} activeLabel="Ativa" inactiveLabel="Inativa" />
                                <ArchivedNote item={item} className="mt-0.5" />
                            </td>
                            <td className={`${CELL_CLASS} max-md:ml-auto`}>{rows.actions(item, { editable: canEdit, onView: () => setViewing(item.id), onEdit: () => setEditor(item) })}</td>
                        </motion.tr>
                    ))}
                </ItemTable>
            )}
            {editor && <ActivityDialog key={editor === "new" ? "new" : editor.id} activity={editor === "new" ? null : editor} onClose={() => setEditor(null)} />}
            {viewing && <ActivityDetailDialog activityId={viewing} onClose={() => setViewing(null)} />}
            {rows.dialog}
        </>
    )
}

function ActivityDialog({ activity, onClose }: { activity: ActivityDto | null; onClose: () => void }) {
    const { business } = useBusinessSpace()
    const save = useSaveItem(business.id, "activities")
    const categories = useCategories(business.id, "activities")
    const [name, setName] = useState(activity?.name ?? "")
    const [category, setCategory] = useState(activity?.category ?? "")
    const [rate, setRate] = useState(activity?.hourlyRateCents ?? 0)
    const [description, setDescription] = useState(activity?.description ?? "")
    const [active, setActive] = useState(activity?.active ?? true)
    const [error, setError] = useState<string | null>(null)

    const submit = async () => {
        const data = { name, category: category.trim() || null, hourlyRateCents: rate, description: description.trim() || null, active }
        const parsed = activityCreateSchema.safeParse(data)
        if (!parsed.success) return setError(parsed.error.issues[0]!.message)
        setError(null)
        await save.mutateAsync({ id: activity?.id, data: activity ? { ...parsed.data, version: activity.version } : parsed.data }).then(onClose, () => undefined)
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{activity ? "Editar atividade" : "Nova atividade"}</DialogTitle>
                    <DialogDescription>{activity ? "Mudar o valor por hora fica no histórico; pedidos e trabalhos existentes mantêm o valor da época." : `Valor por hora em ${business.currency}.`}</DialogDescription>
                </DialogHeader>
                <form className="space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); void submit() }}>
                    <div className={FORM_GRID}>
                        <Field id="activity-name" label="Nome">
                            <Input id="activity-name" autoFocus value={name} maxLength={120} disabled={save.isPending} onChange={(event) => setName(event.target.value)} />
                        </Field>
                        <Field id="activity-category" label="Categoria">
                            <CategoryInput id="activity-category" value={category} onChange={setCategory} suggestions={categories.data ?? []} disabled={save.isPending} />
                        </Field>
                        <Field id="activity-rate" label="Valor por hora">
                            <MoneyInput id="activity-rate" prefix={currencySymbol(business.currency)} value={rate / 100} disabled={save.isPending} onChange={(value) => setRate(Math.round(value * 100))} />
                        </Field>
                        <label className="flex items-center gap-2 self-end pb-2 text-sm">
                            <Checkbox checked={active} disabled={save.isPending} onCheckedChange={(value) => setActive(value === true)} />
                            Ativa (aparece em novos pedidos)
                        </label>
                    </div>
                    <Field id="activity-description" label="Descrição">
                        <Textarea id="activity-description" rows={4} value={description} maxLength={ITEM_DESCRIPTION_MAX} disabled={save.isPending} onChange={(event) => setDescription(event.target.value)} />
                    </Field>
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={save.isPending}>
                            {save.isPending ? "Salvando..." : activity ? "Salvar" : "Criar atividade"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function ActivityDetailDialog({ activityId, onClose }: { activityId: string; onClose: () => void }) {
    const { business } = useBusinessSpace()
    const query = useActivityDetail(business.id, activityId)
    const activity = query.data
    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{activity?.name ?? "Atividade"}</DialogTitle>
                    <DialogDescription>{activity ? [activity.category, `${formatMoney(activity.hourlyRateCents, business.currency)}/hora`, activity.active ? "Ativa" : "Inativa"].filter(Boolean).join(" · ") : "Carregando…"}</DialogDescription>
                </DialogHeader>
                {query.isPending ? (
                    <Skeleton className="h-40" />
                ) : query.isError || !activity ? (
                    <ErrorState description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : (
                    <div className="space-y-4">
                        {activity.description && <p className="whitespace-pre-wrap text-sm">{activity.description}</p>}
                        <section className="space-y-2">
                            <h3 className="text-sm font-semibold">Histórico do valor por hora</h3>
                            <ul className="divide-y rounded-md border">
                                {activity.priceHistory.map((entry, index) => (
                                    <li key={`${entry.at}-${index}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                                        <span>
                                            {entry.fromCents === null ? (
                                                <>Criada com <strong>{formatMoney(entry.toCents, business.currency)}</strong></>
                                            ) : (
                                                <>
                                                    {formatMoney(entry.fromCents, business.currency)} → <strong>{formatMoney(entry.toCents, business.currency)}</strong>
                                                </>
                                            )}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {format(new Date(entry.at), "dd/MM/yyyy HH:mm")} · {entry.actorName ?? "Usuário removido"}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
