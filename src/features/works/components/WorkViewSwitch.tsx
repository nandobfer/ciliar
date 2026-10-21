"use client"

import { motion } from "framer-motion"
import { LayoutGrid, Table2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { WorkViewMode } from "../constants"

const OPTIONS = [
    { value: "kanban", label: "Kanban", icon: LayoutGrid },
    { value: "table", label: "Tabela", icon: Table2 },
] as const satisfies readonly { value: WorkViewMode; label: string; icon: typeof LayoutGrid }[]

/** Alterna Kanban | Tabela (o mesmo switch das Tarefas do Opex), com destaque deslizante. */
export function WorkViewSwitch({ value, onChange, className }: { value: WorkViewMode; onChange: (value: WorkViewMode) => void; className?: string }) {
    return (
        <div role="radiogroup" aria-label="Visualização" className={cn("flex items-center gap-1 rounded-md border border-border bg-card p-1", className)}>
            {OPTIONS.map((option) => {
                const active = value === option.value
                const Icon = option.icon
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "relative inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors md:flex-none",
                            active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {active && <motion.span layoutId="work-view-switch" className="absolute inset-0 rounded-md bg-primary shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                        <Icon className="relative h-3.5 w-3.5" aria-hidden />
                        <span className="relative">{option.label}</span>
                    </button>
                )
            })}
        </div>
    )
}
