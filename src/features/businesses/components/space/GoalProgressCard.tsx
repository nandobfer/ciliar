"use client"

import type { ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { format } from "date-fns"
import { Target } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { browserTimeZone, todayKeyIn } from "@/lib/timezone"
import { describeGoal, formatMoney } from "../../format"
import type { GoalWindowProgress } from "../../goal-progress"
import type { GoalItemDto } from "../../types"

const STATUS_LABEL = { active: null, upcoming: "Ainda não começou", ended: "Encerrada" } as const

export const goalTitle = (goal: Pick<GoalItemDto, "name" | "period">) => goal.name || (goal.period === "hour" ? "Meta por hora" : goal.period === "month" ? "Meta mensal" : "Meta anual")

/** Selo da meta na linha do tempo. */
export function goalBadge(goal: Pick<GoalItemDto, "status" | "supersededReason">): { label: string; tone: "primary" | "muted" | "warning" } {
    if (goal.status === "active") return { label: "Atual", tone: "primary" }
    if (goal.status === "archived") return { label: "Arquivada", tone: "warning" }
    return { label: goal.supersededReason === "edit" ? "Nova versão" : "Substituída", tone: "muted" }
}

export function GoalBadge({ goal }: { goal: Pick<GoalItemDto, "status" | "supersededReason"> }) {
    const badge = goalBadge(goal)
    return (
        <span
            className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                badge.tone === "primary" && "border-primary/40 bg-primary/15 text-primary",
                badge.tone === "warning" && "border-warning/40 bg-warning/10 text-warning",
                badge.tone === "muted" && "text-muted-foreground",
            )}
        >
            {badge.label}
        </span>
    )
}

const day = (iso: string) => format(new Date(iso), "dd/MM/yyyy")

/** "05/03/2026 → 20/10/2026" ou "desde 20/10/2026" (um por período em que foi a ativa). */
export function goalPeriodTexts(goal: Pick<GoalItemDto, "activePeriods">): string[] {
    return [...goal.activePeriods].reverse().map((period) => (period.to ? `${day(period.from)} → ${day(period.to)}` : `desde ${day(period.from)}`))
}

/** Dias que faltam para o fim da janela (`null` se já terminou ou não começou). */
export function daysLeft(window: Pick<GoalWindowProgress, "from" | "to">, today: string): number | null {
    if (today < window.from || today > window.to) return null
    return Math.round((Date.UTC(...ymd(window.to)) - Date.UTC(...ymd(today))) / 86_400_000)
}
const ymd = (key: string) => {
    const [year, month, date] = key.split("-").map(Number) as [number, number, number]
    return [year, month - 1, date] as const
}

/** Atingido × alvo de uma janela (faturamento bruto ou valor médio por hora). */
export function GoalWindowLine({ goal, window, currency, compact = false }: { goal: Pick<GoalItemDto, "period" | "targetCents">; window: GoalWindowProgress; currency: string; compact?: boolean }) {
    const hourly = goal.period === "hour"
    const target = `${formatMoney(goal.targetCents, currency)}${hourly ? "/h" : ""}`
    if (!window.available) {
        return (
            <div className={cn("space-y-1", compact && "text-xs")}>
                <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">{window.label}</span>
                    <span className="text-muted-foreground">Indisponível · sem horas apontadas</span>
                </div>
            </div>
        )
    }
    const achieved = `${formatMoney(window.achievedCents ?? 0, currency)}${hourly ? "/h" : ""}`
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{window.label}</span>
                <span>
                    <span className="font-semibold">{achieved}</span>
                    <span className="text-muted-foreground"> de {target}</span>
                </span>
            </div>
            <Progress value={Math.min(100, window.percent ?? 0)} aria-label={`${window.label}: ${window.percent ?? 0}% da meta`} />
            {!compact && <p className="text-right text-xs text-muted-foreground">{(window.percent ?? 0).toLocaleString("pt-BR")}%</p>}
        </div>
    )
}

/** Cartão de uma meta: descrição, situação e o progresso da janela corrente. */
export function GoalProgressCard({ goal, currency, children }: { goal: GoalItemDto; currency: string; children?: ReactNode }) {
    const status = STATUS_LABEL[goal.progress.status]
    return (
        <Card className="flex h-full flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate font-semibold">{goalTitle(goal)}</p>
                    <p className="text-xs text-muted-foreground">{describeGoal({ ...goal, name: null }, currency)}</p>
                </div>
                {status && <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{status}</span>}
            </div>
            {goal.progress.current && <GoalWindowLine goal={goal} window={goal.progress.current} currency={currency} />}
            {children}
        </Card>
    )
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="truncate font-mono text-lg font-bold text-foreground">{value}</p>
            {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
    )
}

/**
 * Meta atual em destaque (largura total): título, situação, barra grande da janela corrente,
 * atingido × alvo, quanto falta e os dias restantes. `actions` à direita do título (página de Metas,
 * link do dashboard).
 */
export function CurrentGoalHighlight({ goal, currency, timeZone, actions, children }: { goal: GoalItemDto; currency: string; timeZone?: string; actions?: ReactNode; children?: ReactNode }) {
    const reduceMotion = useReducedMotion()
    const window = goal.progress.current
    const status = STATUS_LABEL[goal.progress.status]
    const hourly = goal.period === "hour"
    const suffix = hourly ? "/h" : ""
    const percent = window?.available ? (window.percent ?? 0) : null
    const today = todayKeyIn(timeZone ?? browserTimeZone())
    const left = window ? daysLeft(window, today) : null
    const missing = window?.available && window.achievedCents !== null ? Math.max(0, goal.targetCents - window.achievedCents) : null

    return (
        <Card className="overflow-hidden p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                        <Target className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-base font-semibold">{goalTitle(goal)}</p>
                            <GoalBadge goal={goal} />
                            {status && <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{status}</span>}
                        </div>
                        <p className="text-sm text-muted-foreground">{describeGoal({ ...goal, name: null }, currency)}</p>
                    </div>
                </div>
                {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
            </div>

            {window && (
                <div className="mt-5 space-y-3">
                    <div className="flex items-end justify-between gap-3">
                        <span className="text-sm text-muted-foreground">{window.label}</span>
                        <span className="font-mono text-2xl font-bold text-foreground">{percent === null ? "—" : `${percent.toLocaleString("pt-BR")}%`}</span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${window.label}: ${percent ?? 0}% da meta`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, percent ?? 0)}>
                        <motion.div
                            className="h-full rounded-full bg-primary"
                            initial={{ width: reduceMotion ? `${Math.min(100, percent ?? 0)}%` : 0 }}
                            animate={{ width: `${Math.min(100, percent ?? 0)}%` }}
                            transition={{ duration: reduceMotion ? 0 : 0.6, ease: "easeOut" }}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-1 sm:grid-cols-4">
                        <Figure label="Atingido" value={window.available && window.achievedCents !== null ? `${formatMoney(window.achievedCents, currency)}${suffix}` : "Indisponível"} hint={!window.available ? "Sem horas apontadas" : undefined} />
                        <Figure label="Alvo" value={`${formatMoney(goal.targetCents, currency)}${suffix}`} />
                        <Figure label="Falta" value={missing === null ? "—" : `${formatMoney(missing, currency)}${suffix}`} />
                        <Figure label="Dias restantes" value={left === null ? "—" : left.toLocaleString("pt-BR")} hint={`Até ${window.to.split("-").reverse().join("/")}`} />
                    </div>
                </div>
            )}
            {children}
        </Card>
    )
}
