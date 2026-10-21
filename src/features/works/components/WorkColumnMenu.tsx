"use client"

import { Check, ChevronDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { COLUMN_COLOR_STYLES, type BoardColumnView } from "../board"
import type { WorkSummaryDto } from "../types"
import { ColumnBadge } from "./WorkBadges"

interface WorkColumnMenuProps {
    work: WorkSummaryDto
    /** Destinos possíveis (no negócio: todas; na visão geral: só as fixas). */
    columns: readonly BoardColumnView[]
    moving: boolean
    disabled?: boolean
    onMove: (work: WorkSummaryDto, column: string) => void
    size?: "sm" | "default"
    className?: string
}

/** Coluna real do trabalho com "Mover para…" (padrão `TaskColumnMenu` do Opex). */
export function WorkColumnMenu({ work, columns, moving, disabled = false, onMove, size = "sm", className }: WorkColumnMenuProps) {
    const current = columns.find((column) => column.key === work.column) ?? { key: work.column, label: work.columnName, dot: COLUMN_COLOR_STYLES.violet.dot }
    return (
        <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        size={size}
                        disabled={moving || disabled}
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        className={cn(size === "sm" && "h-7 px-2", "min-w-0 gap-1.5")}
                        aria-label={`Coluna: mover ${work.code}`}
                    >
                        <ColumnBadge column={current} />
                        {moving ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden /> : !disabled && <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" onClick={(event) => event.stopPropagation()}>
                    <DropdownMenuLabel className="text-xs">Mover para…</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {columns.map((column) => {
                        const selected = column.key === work.column
                        return (
                            <DropdownMenuItem key={column.key} disabled={selected} onSelect={() => onMove(work, column.key)} className="gap-2">
                                <ColumnBadge column={column} />
                                {selected && <Check className="ml-auto h-3.5 w-3.5" aria-hidden />}
                            </DropdownMenuItem>
                        )
                    })}
                </DropdownMenuContent>
            </DropdownMenu>
        </span>
    )
}
