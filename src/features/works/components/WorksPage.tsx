"use client"

import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { Archive, Briefcase, FilterX, Hammer, ListChecks, RefreshCw, UserRound } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { usePersistentState } from "@/hooks/usePersistentState"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { CONTENT_BLEED_X } from "@/features/layout/content-padding"
import { matchesSearch } from "@/features/businesses/components/space/item-ui"
import { useBusinesses } from "@/features/businesses/hooks/useBusinesses"
import { useClients } from "@/features/orders/hooks/useOrders"
import { boardColumnOf, buildBoardColumns, mergeVisibleOrder, overviewColumns, shiftColumn, type WorkColumnDto } from "../board"
import { WORK_SORT_KEYS, WORK_SORT_LABELS, WORK_VIEW_MODES, workHref, type WorkSortKey } from "../constants"
import { useWorkBoard, useWorkColumnMutations, useWorks, WORKS_KEY } from "../hooks/useWorks"
import type { WorkSummaryDto } from "../types"
import { ColumnFormDialog } from "./ColumnFormDialog"
import { WorkBoard } from "./WorkBoard"
import { useWorkMoveFlow } from "./WorkMoveFlow"
import { WORK_TABLE_COLUMNS, WorkTable, type WorkTableSort } from "./WorkTable"
import { WorkViewSwitch } from "./WorkViewSwitch"

const prefsSchema = z.object({
    view: z.enum(WORK_VIEW_MODES).catch("kanban"),
    sort: z.enum(WORK_SORT_KEYS).catch("manual"),
    showArchived: z.boolean().catch(false),
    tableSort: z.object({ column: z.enum(WORK_TABLE_COLUMNS), direction: z.enum(["asc", "desc"]) }).catch({ column: "code", direction: "desc" }),
})
type Prefs = z.infer<typeof prefsSchema>
const DEFAULT_PREFS: Prefs = { view: "kanban", sort: "manual", showArchived: false, tableSort: { column: "code", direction: "desc" } }
const OVERVIEW_COLUMNS = overviewColumns()
const FIXED_TARGETS = OVERVIEW_COLUMNS.filter((column) => column.key !== "others")

const swap = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.2 } }

/**
 * Trabalhos (M4): Kanban | Tabela dentro do espaço do negócio (`businessId`, colunas reais com as
 * customizadas) ou a visão geral `/trabalhos` (todos os negócios: as 4 fixas + "Outras etapas"; a
 * Tabela mostra a coluna real). Preferências (visão, ordenação, arquivados) ficam no navegador.
 */
export function WorksPage({ businessId, editable: spaceEditable = true }: { businessId?: string; editable?: boolean }) {
    const router = useRouter()
    const reduceMotion = useReducedMotion()
    const queryClient = useQueryClient()
    const overview = !businessId
    const { value: prefs, setValue: setPrefs, ready } = usePersistentState<Prefs>(overview ? "ciliar:works:overview" : "ciliar:works:business", prefsSchema, DEFAULT_PREFS)
    const list = useWorks({ businessId, showArchived: prefs.showArchived }, ready)
    const board = useWorkBoard(businessId ?? null)
    const clients = useClients()
    const businesses = useBusinesses(overview)
    const columnMutations = useWorkColumnMutations(businessId ?? "")
    const [search, setSearch] = useState("")
    const [businessFilter, setBusinessFilter] = useState<string[]>([])
    const [clientFilter, setClientFilter] = useState<string[]>([])

    const columns = useMemo(() => (overview ? OVERVIEW_COLUMNS : buildBoardColumns(board.data)), [overview, board.data])
    const flow = useWorkMoveFlow(overview ? FIXED_TARGETS : columns)
    const editable = spaceEditable && (list.data?.editable ?? false) && (overview || (board.data?.editable ?? false))

    const works = useMemo(
        () =>
            (list.data?.items ?? []).filter(
                (work) =>
                    (!businessFilter.length || businessFilter.includes(work.businessId)) &&
                    (!clientFilter.length || clientFilter.includes(work.clientId)) &&
                    matchesSearch(search, work.code, work.title, work.clientName, work.businessName, work.columnName),
            ),
        [list.data, businessFilter, clientFilter, search],
    )
    const kanbanWorks = useMemo(() => works.filter((work) => work.status === "active" || prefs.showArchived), [works, prefs.showArchived])
    const rawCounts = useMemo(() => {
        if (!overview && board.data) return board.data.counts
        const counts: Record<string, number> = {}
        for (const work of list.data?.items ?? []) counts[boardColumnOf(work, overview)] = (counts[boardColumnOf(work, overview)] ?? 0) + 1
        return counts
    }, [overview, board.data, list.data])

    // Colunas: criar/editar (diálogo), mover e excluir (confirmação). Só no quadro do negócio.
    const [columnForm, setColumnForm] = useState<{ column: WorkColumnDto | null; afterKey: string | null } | null>(null)
    const [deleting, setDeleting] = useState<WorkColumnDto | null>(null)
    const layout = useMemo(() => columns.map((column) => column.key), [columns])
    const columnActions = useMemo(
        () => ({
            onCreateAfter: (afterKey: string) => setColumnForm({ column: null, afterKey }),
            onEdit: (column: WorkColumnDto) => setColumnForm({ column, afterKey: null }),
            onDelete: (column: WorkColumnDto) => setDeleting(column),
            onShift: (key: string, direction: -1 | 1) => {
                const next = shiftColumn(layout, key, direction)
                if (next) columnMutations.reorder.mutate(next)
            },
        }),
        [layout, columnMutations.reorder],
    )
    const reorderColumns = useCallback((order: string[]) => columnMutations.reorder.mutate(mergeVisibleOrder(board.data?.layout ?? layout, order)), [columnMutations.reorder, board.data, layout])

    const refreshing = list.isFetching || board.isFetching
    const refresh = useCallback(() => void queryClient.invalidateQueries({ queryKey: [WORKS_KEY] }), [queryClient])
    const open = useCallback((work: WorkSummaryDto) => router.push(workHref(work.businessId, work.id)), [router])
    const filtering = Boolean(search || businessFilter.length || clientFilter.length)
    const clear = () => {
        setSearch("")
        setBusinessFilter([])
        setClientFilter([])
    }
    const loading = !ready || list.isPending || (!overview && board.isPending)
    const error = list.isError ? list.error : !overview && board.isError ? board.error : null
    const view = loading ? "loading" : error ? "error" : !works.length && (filtering || prefs.view === "table" || !(list.data?.items.length ?? 0)) ? "empty" : prefs.view
    const kanbanLayout = view === "kanban"

    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }} className={cn(kanbanLayout ? "flex flex-col gap-4 md:min-h-full md:flex-1" : "space-y-4")}>
            <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0 flex-1">
                    <CadastroHeader title="Trabalhos" description={overview ? "Trabalhos de todos os seus negócios: mova para as etapas customizadas dentro do negócio" : "Pedidos aceitos, da Abertura ao Pago: arraste entre as colunas"} />
                </div>
                <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
                    <WorkViewSwitch value={prefs.view} onChange={(next) => setPrefs((prev) => ({ ...prev, view: next }))} className="w-full md:w-auto" />
                    <Button type="button" variant="outline" size="sm" className="h-9 gap-2" onClick={refresh} disabled={refreshing} aria-label="Atualizar trabalhos">
                        <motion.span animate={{ rotate: refreshing ? 360 : 0 }} transition={refreshing ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0.2 }} className="inline-flex">
                            <RefreshCw className="h-4 w-4" aria-hidden />
                        </motion.span>
                        Atualizar
                    </Button>
                </div>
            </header>

            <ListFilters
                collapsible
                total={works.length}
                search={{ value: search, onChange: setSearch, placeholder: "Código, título, cliente ou coluna", label: "Buscar trabalhos" }}
                onClear={clear}
                secondary={
                    <>
                        <FilterGroup label="Ordenar cards" className="min-w-[160px] flex-1">
                            <Select value={prefs.sort} onValueChange={(value) => setPrefs((prev) => ({ ...prev, sort: value as WorkSortKey }))}>
                                <SelectTrigger className="h-10" aria-label="Ordenar cards">
                                    <ListChecks className="mr-2 h-4 w-4 text-primary opacity-50" aria-hidden />
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {WORK_SORT_KEYS.map((key) => (
                                        <SelectItem key={key} value={key}>
                                            {WORK_SORT_LABELS[key]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </FilterGroup>
                        <FilterGroup label="Arquivados" className="shrink-0">
                            <Button
                                type="button"
                                variant="outline"
                                aria-pressed={prefs.showArchived}
                                onClick={() => setPrefs((prev) => ({ ...prev, showArchived: !prev.showArchived }))}
                                className={cn("h-10 gap-2", prefs.showArchived && "border-primary bg-primary/15 text-primary hover:bg-primary/20")}
                            >
                                <Archive className="h-4 w-4" aria-hidden />
                                {prefs.showArchived ? "Mostrando" : "Ocultos"}
                            </Button>
                        </FilterGroup>
                    </>
                }
            >
                {overview && (
                    <FilterGroup label="Negócio" className="min-w-[180px] flex-1">
                        <CadastroMultiSelect aria-label="Negócio" icon={Briefcase} placeholder="Todos" searchable selected={businessFilter} onSelect={setBusinessFilter} options={(businesses.data?.items ?? []).map((business) => ({ value: business.id, label: business.name }))} />
                    </FilterGroup>
                )}
                <FilterGroup label="Cliente" className="min-w-[180px] flex-1">
                    <CadastroMultiSelect aria-label="Cliente" icon={UserRound} placeholder="Todos" searchable selected={clientFilter} onSelect={setClientFilter} options={(clients.data?.items ?? []).map((client) => ({ value: client.id, label: client.name }))} />
                </FilterGroup>
            </ListFilters>

            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={view} {...swap} className={cn(view === "kanban" && "flex min-h-0 flex-col md:min-h-[28rem] md:flex-1 md:basis-0")}>
                    {view === "loading" && <WorksSkeleton kanban={prefs.view === "kanban"} />}
                    {view === "error" && <ErrorState title="Não foi possível carregar os trabalhos" description={apiErrorMessage(error, "Tente novamente.")} onRetry={refresh} />}
                    {view === "empty" && (
                        <EmptyState
                            icon={filtering ? FilterX : Hammer}
                            title={filtering ? "Nenhum trabalho com estes filtros" : "Nenhum trabalho ainda"}
                            description={filtering ? "Ajuste ou limpe os filtros para ver mais trabalhos." : "Todo trabalho nasce de um pedido aceito: ele entra aqui na coluna Abertura."}
                            actionLabel={filtering ? "Limpar filtros" : undefined}
                            onAction={filtering ? clear : undefined}
                        />
                    )}
                    {view === "kanban" && (
                        <div className="flex min-h-0 flex-col max-md:block md:flex-1 md:basis-0">
                            <WorkBoard
                                works={kanbanWorks}
                                columns={columns}
                                rawCounts={rawCounts}
                                sort={prefs.sort}
                                overview={overview}
                                editable={editable}
                                movingId={flow.movingId}
                                actions={columnActions}
                                onMove={flow.move}
                                onReorderColumns={reorderColumns}
                                onOpen={open}
                            />
                        </div>
                    )}
                    {view === "table" && (
                        <WorkTable
                            works={works}
                            columnsOf={() => (overview ? FIXED_TARGETS : columns)}
                            layout={overview ? ["opening", "execution", "validation", "paid"] : layout}
                            overview={overview}
                            editable={editable}
                            sort={prefs.tableSort as WorkTableSort}
                            onSortChange={(tableSort) => setPrefs((prev) => ({ ...prev, tableSort }))}
                            movingId={flow.movingId}
                            onMove={(work, column) => flow.move(work, column)}
                            onOpen={open}
                        />
                    )}
                </motion.div>
            </AnimatePresence>

            {flow.dialogs}

            {!overview && businessId && (
                <>
                    <ColumnFormDialog
                        open={columnForm !== null}
                        column={columnForm?.column ?? null}
                        submitting={columnMutations.create.isPending || columnMutations.update.isPending}
                        onClose={() => setColumnForm(null)}
                        onSubmit={async (values) => {
                            if (!columnForm) return
                            try {
                                if (columnForm.column) await columnMutations.update.mutateAsync({ key: columnForm.column.key, input: values })
                                else await columnMutations.create.mutateAsync({ ...values, afterKey: columnForm.afterKey })
                                setColumnForm(null)
                            } catch {
                                // Toast já mostrado; o diálogo fica aberto para corrigir.
                            }
                        }}
                    />
                    <AlertDialog open={deleting !== null} onOpenChange={(next) => !next && setDeleting(null)}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Excluir a coluna &quot;{deleting?.name}&quot;?</AlertDialogTitle>
                                <AlertDialogDescription>A coluna está vazia e some do quadro e da tabela.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() => {
                                        if (deleting) columnMutations.remove.mutate(deleting.key)
                                        setDeleting(null)
                                    }}
                                >
                                    Excluir
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </>
            )}
        </motion.section>
    )
}

function WorksSkeleton({ kanban }: { kanban: boolean }) {
    if (!kanban) return <Skeleton className="h-[420px] w-full" aria-label="Carregando trabalhos" />
    return (
        <div className={cn("flex gap-3 overflow-hidden", CONTENT_BLEED_X)} aria-label="Carregando trabalhos">
            {Array.from({ length: 5 }, (_, column) => (
                <div key={column} className="w-[290px] shrink-0 space-y-2 rounded-lg border bg-muted/40 p-2">
                    <Skeleton className="h-6 w-1/2" />
                    {Array.from({ length: 3 - (column % 2) }, (_, card) => (
                        <Skeleton key={card} className="h-28 w-full" />
                    ))}
                </div>
            ))}
        </div>
    )
}
