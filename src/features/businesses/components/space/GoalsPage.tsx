"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Archive, ArchiveRestore, History, Pencil, Plus, Target, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { describeGoal } from "../../format"
import { draftFrom, emptyGoal, goalOf, type GoalDraft } from "../../interview-answers"
import { goalSchema } from "../../schemas"
import type { GoalItemDto } from "../../types"
import { useGoalAction, useGoals, useSaveItem } from "../../hooks/useBusinessSpace"
import { GoalsControl } from "../interview/InterviewAnswerControl"
import { useBusinessSpace } from "./BusinessSpaceLayout"
import { CurrentGoalHighlight, GoalBadge, GoalWindowLine, goalBadge, goalPeriodTexts, goalTitle } from "./GoalProgressCard"
import { ArchivedNote } from "./item-ui"

type Pending = { kind: "archive" | "delete"; goal: GoalItemDto } | null

/**
 * Metas: **uma meta ativa por negócio**. A atual em destaque (editar cria uma nova versão; arquivar
 * reativa a anterior) e a linha do tempo à direita com as substituídas e arquivadas (somente leitura;
 * as arquivadas podem ser restauradas como a atual ou excluídas definitivamente).
 */
export function GoalsPage() {
    const { business, editable } = useBusinessSpace()
    const reduceMotion = useReducedMotion()
    const query = useGoals(business.id)
    const action = useGoalAction(business.id)
    const [editor, setEditor] = useState<GoalItemDto | "new" | null>(null)
    const [viewing, setViewing] = useState<GoalItemDto | null>(null)
    const [pending, setPending] = useState<Pending>(null)
    const [understood, setUnderstood] = useState(false)
    const data = query.data
    const canEdit = editable && (data?.editable ?? false)
    const current = data?.current ?? null
    // A meta que volta a valer ao arquivar a atual: a substituída mais recente.
    const previous = data?.history.filter((goal) => goal.status === "superseded").sort((a, b) => (b.supersededAt ?? "").localeCompare(a.supersededAt ?? ""))[0] ?? null

    return (
        <>
            <CadastroHeader
                title="Metas"
                description="Uma meta de faturamento bruto por vez (trabalhos pagos, pela data do pagamento)"
                actionLabel={canEdit ? "Nova meta" : undefined}
                actionIcon={<Plus className="h-4 w-4" />}
                onAction={() => setEditor("new")}
            />
            {query.isPending ? (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
                    <Skeleton className="h-64" />
                    <Skeleton className="h-64" />
                </div>
            ) : query.isError || !data ? (
                <ErrorState title="Não foi possível carregar as metas" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
                    <motion.section key={current?.id ?? "none"} aria-label="Meta atual" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="min-w-0 space-y-4">
                        {current ? (
                            <CurrentGoalHighlight
                                goal={current}
                                currency={business.currency}
                                actions={
                                    canEdit && (
                                        <>
                                            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setEditor(current)}>
                                                <Pencil className="h-4 w-4" aria-hidden /> Editar
                                            </Button>
                                            <Button type="button" variant="ghost" size="sm" className="gap-1.5" disabled={action.isPending} onClick={() => setPending({ kind: "archive", goal: current })}>
                                                <Archive className="h-4 w-4" aria-hidden /> Arquivar
                                            </Button>
                                        </>
                                    )
                                }
                            >
                                {current.progress.history.length > 0 && (
                                    <div className="mt-5 space-y-3 border-t pt-4">
                                        <p className="text-sm font-medium">Janelas anteriores</p>
                                        {current.progress.history.map((window) => (
                                            <GoalWindowLine key={window.key} goal={current} window={window} currency={business.currency} compact />
                                        ))}
                                    </div>
                                )}
                            </CurrentGoalHighlight>
                        ) : (
                            <Card>
                                <EmptyState
                                    icon={Target}
                                    title="Nenhuma meta ativa"
                                    description="Defina a meta de faturamento bruto por mês, por ano ou por hora."
                                    actionLabel={canEdit ? "Definir meta" : undefined}
                                    onAction={() => setEditor("new")}
                                />
                            </Card>
                        )}
                    </motion.section>
                    <GoalTimeline current={current} history={data.history} onSelect={setViewing} />
                </div>
            )}

            {editor && <GoalDialog key={editor === "new" ? "new" : editor.id} goal={editor === "new" ? null : editor} hasCurrent={Boolean(current)} onClose={() => setEditor(null)} />}
            {viewing && (
                <GoalDetailsDialog
                    goal={viewing}
                    canEdit={canEdit}
                    busy={action.isPending}
                    onClose={() => setViewing(null)}
                    onRestore={() => action.mutate({ id: viewing.id, action: "restore" }, { onSuccess: () => setViewing(null) })}
                    onDelete={() => {
                        setUnderstood(false)
                        setPending({ kind: "delete", goal: viewing })
                    }}
                />
            )}
            <ConfirmDialog
                open={pending !== null}
                onOpenChange={(open) => !open && setPending(null)}
                title={pending?.kind === "delete" ? `Excluir definitivamente "${pending ? goalTitle(pending.goal) : ""}"?` : "Arquivar a meta atual?"}
                description={
                    pending?.kind === "delete"
                        ? "Esta ação é irreversível: a meta sai da linha do tempo agora."
                        : previous
                          ? `A meta anterior volta a valer: ${describeGoal(previous, business.currency)}. A arquivada é excluída definitivamente depois do prazo configurado; até lá, pode ser restaurada.`
                          : "Não há meta anterior: o negócio ficará sem meta. A arquivada é excluída definitivamente depois do prazo configurado; até lá, pode ser restaurada."
                }
                confirmLabel={pending?.kind === "delete" ? "Excluir definitivamente" : "Arquivar"}
                variant={pending?.kind === "delete" ? "destructive" : "default"}
                pending={action.isPending}
                onConfirm={() => {
                    if (!pending || (pending.kind === "delete" && !understood)) return
                    action.mutate(
                        { id: pending.goal.id, action: pending.kind },
                        {
                            onSettled: () => setPending(null),
                            onSuccess: () => pending.kind === "delete" && setViewing(null),
                        },
                    )
                }}
            >
                {pending?.kind === "delete" && (
                    <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={understood} onCheckedChange={(value) => setUnderstood(value === true)} />
                        Entendo que a exclusão é irreversível
                    </label>
                )}
            </ConfirmDialog>
        </>
    )
}

/** Linha do tempo vertical: a atual no topo e o histórico (mais recentes primeiro). */
function GoalTimeline({ current, history, onSelect }: { current: GoalItemDto | null; history: GoalItemDto[]; onSelect: (goal: GoalItemDto) => void }) {
    const { business } = useBusinessSpace()
    const reduceMotion = useReducedMotion()
    const items = [...(current ? [current] : []), ...history]
    return (
        <nav aria-labelledby="goal-timeline" className="space-y-3 lg:sticky lg:top-0">
            <h2 id="goal-timeline" className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <History className="h-4 w-4 text-muted-foreground" aria-hidden /> Linha do tempo
            </h2>
            {!items.length ? (
                <p className="text-sm text-muted-foreground">Nenhuma meta ainda.</p>
            ) : (
                <ol className="relative space-y-1 border-l border-border pl-4">
                    {items.map((goal, index) => {
                        const tone = goalBadge(goal).tone
                        return (
                            <motion.li key={goal.id} className="relative" initial={reduceMotion ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduceMotion ? 0 : index * 0.04, duration: 0.2 }}>
                                <span
                                    aria-hidden
                                    className={cn(
                                        "absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full ring-4 ring-background",
                                        tone === "primary" ? "bg-primary shadow-[0_0_8px_hsl(var(--primary))]" : tone === "warning" ? "bg-warning" : "bg-muted-foreground/60",
                                    )}
                                />
                                <button type="button" onClick={() => onSelect(goal)} className="group w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                    <span className="flex items-center justify-between gap-2">
                                        <span className="truncate text-sm font-medium group-hover:text-foreground">{goalTitle(goal)}</span>
                                        <GoalBadge goal={goal} />
                                    </span>
                                    <span className="block truncate text-xs text-muted-foreground">{describeGoal({ ...goal, name: null }, business.currency)}</span>
                                    {goalPeriodTexts(goal).map((text) => (
                                        <span key={text} className="block font-mono text-[11px] text-muted-foreground">
                                            {text}
                                        </span>
                                    ))}
                                </button>
                            </motion.li>
                        )
                    })}
                </ol>
            )}
        </nav>
    )
}

/** Detalhes (somente leitura) de uma meta da linha do tempo; as arquivadas podem ser restauradas ou excluídas. */
function GoalDetailsDialog({ goal, canEdit, busy, onClose, onRestore, onDelete }: { goal: GoalItemDto; canEdit: boolean; busy: boolean; onClose: () => void; onRestore: () => void; onDelete: () => void }) {
    const { business } = useBusinessSpace()
    const windows = [...(goal.progress.current ? [goal.progress.current] : []), ...goal.progress.history]
    return (
        <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
            <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {goalTitle(goal)} <GoalBadge goal={goal} />
                    </DialogTitle>
                    <DialogDescription>{describeGoal({ ...goal, name: null }, business.currency)}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Período em que foi a meta ativa</p>
                        {goalPeriodTexts(goal).map((text) => (
                            <p key={text} className="font-mono text-sm">
                                {text}
                            </p>
                        ))}
                    </div>
                    <ArchivedNote item={goal} />
                    {windows.length > 0 && (
                        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                            {windows.map((window) => (
                                <GoalWindowLine key={window.key} goal={goal} window={window} currency={business.currency} compact />
                            ))}
                        </div>
                    )}
                    {goal.status === "superseded" && <p className="text-xs text-muted-foreground">Metas do histórico são somente leitura.</p>}
                </div>
                <DialogFooter>
                    {canEdit && goal.status === "archived" && (
                        <>
                            <Button type="button" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" disabled={busy} onClick={onDelete}>
                                <Trash2 className="h-4 w-4" aria-hidden /> Excluir definitivamente
                            </Button>
                            <Button type="button" className="gap-1.5" disabled={busy} onClick={onRestore}>
                                <ArchiveRestore className="h-4 w-4" aria-hidden /> Restaurar como atual
                            </Button>
                        </>
                    )}
                    {!(canEdit && goal.status === "archived") && (
                        <Button type="button" variant="outline" onClick={onClose}>
                            Fechar
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function GoalDialog({ goal, hasCurrent, onClose }: { goal: GoalItemDto | null; hasCurrent: boolean; onClose: () => void }) {
    const { business } = useBusinessSpace()
    const save = useSaveItem(business.id, "goals")
    const [name, setName] = useState(goal?.name ?? "")
    const [draft, setDraft] = useState<GoalDraft>(() => (goal ? draftFrom("goals", [goal])[0]! : emptyGoal()))
    const [error, setError] = useState<string | null>(null)

    const submit = async () => {
        const parsed = goalSchema.safeParse({ ...goalOf(draft), name: name.trim() || null })
        if (!parsed.success) return setError(parsed.error.issues[0]!.message)
        setError(null)
        await save.mutateAsync({ id: goal?.id, data: goal ? { ...parsed.data, version: goal.version } : parsed.data }).then(onClose, () => undefined)
    }

    const notice = goal ? "Salvar cria uma nova versão da meta; a versão atual vai para a linha do tempo." : hasCurrent ? "A nova meta passa a ser a atual; a meta atual vai para a linha do tempo." : null

    return (
        <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{goal ? "Editar meta" : "Nova meta"}</DialogTitle>
                    <DialogDescription>Somente faturamento bruto, em {business.currency}. Mês e ano: recorrente ou específico; por hora: escolha a janela de medição.</DialogDescription>
                </DialogHeader>
                <form
                    className="space-y-4"
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault()
                        void submit()
                    }}
                >
                    {notice && <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">{notice}</p>}
                    <Field id="goal-name" label="Nome (opcional)">
                        <Input id="goal-name" autoFocus value={name} maxLength={80} disabled={save.isPending} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Meta do semestre" />
                    </Field>
                    <GoalsControl single draft={[draft]} onChange={(next) => setDraft(next[0]!)} disabled={save.isPending} currency={business.currency} />
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
                            {save.isPending ? "Salvando..." : goal ? "Salvar nova versão" : "Criar meta"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
