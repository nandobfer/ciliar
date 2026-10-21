"use client"

import { useMemo } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/features/businesses/format"
import { dateKeyLabel } from "@/features/orders/components/OrderBadges"
import type { BoardColumnView } from "../board"
import type { WorkSummaryDto } from "../types"
import { ArchivedBadge, HoursProgress, WorkDeadlineBadge } from "./WorkBadges"
import { WorkColumnMenu } from "./WorkColumnMenu"

export const WORK_TABLE_COLUMNS = ["code", "title", "business", "column", "value", "due", "hours", "paid"] as const
export type WorkTableColumn = (typeof WORK_TABLE_COLUMNS)[number]
export type WorkTableSort = { column: WorkTableColumn; direction: "asc" | "desc" }

const LABELS: Record<WorkTableColumn, string> = { code: "Código", title: "Trabalho", business: "Negócio", column: "Coluna", value: "Valor", due: "Prazo", hours: "Horas", paid: "Pago em" }
const WIDTHS: Partial<Record<WorkTableColumn, string>> = { code: "w-[100px]", business: "w-[160px]", column: "w-[180px]", value: "w-[130px]", due: "w-[140px]", hours: "w-[150px]", paid: "w-[120px]" }
/** Sem rolagem horizontal: as colunas menos importantes somem em telas estreitas. */
const RESPONSIVE: Partial<Record<WorkTableColumn, string>> = { business: "hidden lg:table-cell", hours: "hidden md:table-cell", paid: "hidden xl:table-cell", due: "hidden sm:table-cell" }

const text = (value: string | null | undefined) => (value ?? "").toLocaleLowerCase("pt-BR")

/** Próxima ordenação ao clicar numa coluna: alterna a direção na mesma coluna. */
export function nextWorkTableSort(current: WorkTableSort, column: WorkTableColumn): WorkTableSort {
    if (current.column === column) return { column, direction: current.direction === "asc" ? "desc" : "asc" }
    return { column, direction: column === "paid" ? "desc" : "asc" }
}

/** `layout` = ordem das colunas do quadro (Coluna ordena por ela). */
export function sortWorkRows(works: readonly WorkSummaryDto[], sort: WorkTableSort, layout: readonly string[]): WorkSummaryDto[] {
    const factor = sort.direction === "asc" ? 1 : -1
    const compare = (a: WorkSummaryDto, b: WorkSummaryDto): number => {
        switch (sort.column) {
            case "code":
                return a.code.localeCompare(b.code, "pt-BR", { numeric: true })
            case "title":
                return text(a.title).localeCompare(text(b.title), "pt-BR")
            case "business":
                return text(a.businessName).localeCompare(text(b.businessName), "pt-BR")
            case "column": {
                const index = (work: WorkSummaryDto) => (layout.includes(work.column) ? layout.indexOf(work.column) : layout.length)
                return index(a) - index(b) || text(a.columnName).localeCompare(text(b.columnName), "pt-BR")
            }
            case "value":
                return a.totalCents - b.totalCents
            case "due":
                return (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99")
            case "hours":
                return a.loggedMinutes - b.loggedMinutes
            case "paid":
                return (a.payment?.paidOn ?? "").localeCompare(b.payment?.paidOn ?? "")
        }
    }
    return [...works].sort((a, b) => compare(a, b) * factor || a.code.localeCompare(b.code, "pt-BR", { numeric: true }))
}

interface WorkTableProps {
    works: readonly WorkSummaryDto[]
    /** Destinos do "Mover para…" de cada trabalho (no negócio: o quadro; na visão geral: as fixas). */
    columnsOf: (work: WorkSummaryDto) => readonly BoardColumnView[]
    layout: readonly string[]
    overview: boolean
    editable: boolean
    sort: WorkTableSort
    onSortChange: (sort: WorkTableSort) => void
    movingId: string | null
    onMove: (work: WorkSummaryDto, column: string) => void
    onOpen: (work: WorkSummaryDto) => void
}

/** Tabela dos trabalhos (padrão `TaskTable` do Opex): ordenável, coluna REAL com "Mover para…" na linha. */
export function WorkTable({ works, columnsOf, layout, overview, editable, sort, onSortChange, movingId, onMove, onOpen }: WorkTableProps) {
    const rows = useMemo(() => sortWorkRows(works, sort, layout), [works, sort, layout])
    const columns = WORK_TABLE_COLUMNS.filter((column) => overview || column !== "business")
    return (
        <TooltipProvider>
            <div className="rounded-md border bg-card" data-testid="work-table">
                <table className="w-full table-fixed caption-bottom text-sm">
                    <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--color-border)]">
                        <tr>
                            {columns.map((column) => {
                                const active = sort.column === column
                                const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown
                                return (
                                    <th key={column} className={cn("h-10 px-3 text-left align-middle text-xs font-semibold text-muted-foreground", WIDTHS[column], RESPONSIVE[column])} aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                                        <button type="button" onClick={() => onSortChange(nextWorkTableSort(sort, column))} className={cn("inline-flex items-center gap-1 transition-colors hover:text-foreground", active && "text-foreground")}>
                                            {LABELS[column]}
                                            <Icon className={cn("h-3 w-3", !active && "opacity-40")} aria-hidden />
                                        </button>
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        <AnimatePresence initial={false}>
                            {rows.map((work) => (
                                <motion.tr
                                    key={work.id}
                                    layout="position"
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.18 }}
                                    onClick={() => onOpen(work)}
                                    onKeyDown={(event) => event.key === "Enter" && onOpen(work)}
                                    tabIndex={0}
                                    aria-label={`Abrir ${work.code}`}
                                    className={cn("cursor-pointer border-b transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none", work.status === "archived" && "opacity-70")}
                                >
                                    <td className="px-3 py-2 font-mono text-xs font-semibold text-primary">{work.code}</td>
                                    <td className="max-w-0 px-3 py-2">
                                        <span className="flex items-center gap-2">
                                            <span className="truncate text-sm" title={work.title}>
                                                {work.title}
                                            </span>
                                            {work.status === "archived" && <ArchivedBadge />}
                                        </span>
                                        <span className="block truncate text-xs text-muted-foreground">{work.clientName ?? "Cliente removido"}</span>
                                    </td>
                                    {overview && <td className={cn("truncate px-3 py-2 text-xs text-muted-foreground", RESPONSIVE.business)}>{work.businessName ?? "—"}</td>}
                                    <td className="px-3 py-2">
                                        <WorkColumnMenu work={work} columns={columnsOf(work)} moving={movingId === work.id} disabled={!editable || work.status === "archived"} onMove={onMove} />
                                    </td>
                                    <td className="px-3 py-2 font-mono text-xs">{formatMoney(work.totalCents, work.currency)}</td>
                                    <td className={cn("px-3 py-2 text-xs", RESPONSIVE.due)}>
                                        {dateKeyLabel(work.dueDate)}
                                        <WorkDeadlineBadge column={work.column} dueDate={work.dueDate} alertDays={work.deadlineAlertDays} className="mt-0.5 flex w-fit" />
                                    </td>
                                    <td className={cn("px-3 py-2", RESPONSIVE.hours)}>
                                        <HoursProgress estimatedMinutes={work.estimatedMinutes} loggedMinutes={work.loggedMinutes} compact />
                                    </td>
                                    <td className={cn("px-3 py-2 text-xs", RESPONSIVE.paid)}>
                                        {work.payment ? (
                                            <>
                                                {dateKeyLabel(work.payment.paidOn)}
                                                <span className="block font-mono text-[11px] text-success">{formatMoney(work.payment.receivedCents, work.currency)}</span>
                                            </>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </td>
                                </motion.tr>
                            ))}
                        </AnimatePresence>
                    </tbody>
                </table>
            </div>
        </TooltipProvider>
    )
}
