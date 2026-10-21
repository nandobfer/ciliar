"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { LayoutDashboard, RefreshCw, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { OptionTabs } from "@/components/ui/option-tabs"

/**
 * Cabeçalho das telas de dashboard (copiado do Opex): título com ícone, ações próprias da tela (à
 * esquerda do período), o **período** (que não quebra linha) e o botão Atualizar (com rotação
 * animada). As opções de período vêm da tela que o usa.
 */
export function DashboardHeader<P extends string>({
    title,
    description,
    icon: Icon = LayoutDashboard,
    leading,
    actions,
    period,
    onPeriodChange,
    periods,
    onRefresh,
    refreshing,
}: {
    title: string
    description: string
    icon?: LucideIcon
    /** Substitui o ícone (ex.: a logo do negócio). */
    leading?: ReactNode
    /** Ações da tela, exibidas antes do seletor de período. */
    actions?: ReactNode
    period: P
    onPeriodChange: (period: P) => void
    periods: readonly { value: P; label: string }[]
    onRefresh: () => void
    refreshing: boolean
}) {
    return (
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-3">
                {leading ?? (
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                        <Icon className="h-5 w-5" aria-hidden />
                    </span>
                )}
                <div className="min-w-0">
                    <h1 className="text-lg font-semibold md:text-2xl">{title}</h1>
                    <p className="text-sm text-muted-foreground">{description}</p>
                </div>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
                {actions}
                <OptionTabs<P>
                    aria-label="Período"
                    className="w-full md:w-auto md:shrink-0"
                    value={period}
                    onChange={onPeriodChange}
                    options={periods}
                />
                <Button type="button" variant="outline" size="sm" className="h-9 gap-2 max-md:hidden" onClick={onRefresh} disabled={refreshing} aria-label="Atualizar indicadores">
                    <motion.span animate={{ rotate: refreshing ? 360 : 0 }} transition={refreshing ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0.2 }} className="inline-flex">
                        <RefreshCw className="h-4 w-4" aria-hidden />
                    </motion.span>
                    Atualizar
                </Button>
            </div>
        </header>
    )
}
