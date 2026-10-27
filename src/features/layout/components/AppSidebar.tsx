"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { activeNavHref, flattenNav } from "../navigation"
import type { NavBadges, NavSectionDef } from "../types"
import { useNavSectionsState } from "../hooks/useNavSectionsState"
import { SidebarNavSection } from "./sidebar/SidebarNavSection"
import { SidebarNavItem } from "./sidebar/SidebarNavItem"
import { SidebarFooter, initials } from "./sidebar/SidebarFooter"
import { SIDEBAR_FOCUS_RING } from "./sidebar/sidebar-styles"

export interface SidebarBrand {
    name: string
    subtitle?: string
    homeHref: string
}

interface AppSidebarProps {
    brand: SidebarBrand
    sections: readonly NavSectionDef[]
    /** Nome do menu para leitor de tela. */
    navLabel: string
    collapsed: boolean
    canCollapse: boolean
    onToggleCollapsed: () => void
    onNavigate?: () => void
    /** Na gaveta (mobile): mostra o botão "Fechar menu". */
    onClose?: () => void
    badges?: NavBadges
    ownerName: string
    version?: string
    /**
     * Itens extras acima do rodapé (ex.: "Agente Opex"). Recebe se a barra está recolhida; cada item
     * renderiza o próprio `<li>`.
     */
    footerItems?: (collapsed: boolean) => ReactNode
}

/**
 * Menu lateral copiado do crm-marketing-campanhas: degradê da cor primária (do Ciliar ou do negócio
 * aberto), marca no topo, barra branca no ativo, recolher/expandir salvo no navegador e a pessoa logada
 * no rodapé; padrão SideNavigation do DS Sipal (seções recolhíveis, contadores acessíveis, foco
 * visível). Só os itens globais: as páginas do negócio ficam nas abas do cabeçalho.
 */
export function AppSidebar({ brand, sections, navLabel, collapsed, canCollapse, onToggleCollapsed, onNavigate, onClose, badges, ownerName, version, footerItems }: AppSidebarProps) {
    const pathname = usePathname()
    const reduceMotion = useReducedMotion() ?? false
    const activeHref = activeNavHref(pathname, flattenNav(sections))
    const activeSectionId = sections.find((section) => section.items.some((item) => item.href === activeHref))?.id
    const sectionsState = useNavSectionsState(activeSectionId)

    return (
        <motion.aside
            animate={{ width: collapsed ? 68 : 240 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
            className="flex h-full shrink-0 flex-col overflow-hidden border-r border-white/10 bg-gradient-to-b from-sidebar to-sidebar-primary text-sidebar-foreground"
        >
            <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/15 px-3">
                <Link
                    href={brand.homeHref}
                    onClick={onNavigate}
                    className={cn("flex min-w-0 items-center gap-2.5 rounded-[6px]", collapsed && "mx-auto", SIDEBAR_FOCUS_RING)}
                    aria-label={collapsed ? brand.name : undefined}
                    title={brand.name}
                >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] bg-white/15 text-sm font-bold ring-1 ring-white/30" aria-hidden>
                        {initials(brand.name)}
                    </span>
                    {!collapsed && (
                        <span className="flex min-w-0 flex-col">
                            <span className="truncate text-sm font-semibold leading-tight">{brand.name}</span>
                            {brand.subtitle && <span className="truncate text-[11px] leading-tight opacity-80">{brand.subtitle}</span>}
                        </span>
                    )}
                </Link>
                {onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        className={cn("rounded-[4px] p-1.5 opacity-80 transition-colors hover:bg-white/15 hover:opacity-100", SIDEBAR_FOCUS_RING)}
                        aria-label="Fechar menu"
                        title="Fechar menu"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
                {canCollapse && !collapsed && (
                    <button
                        type="button"
                        onClick={onToggleCollapsed}
                        className={cn("rounded-[4px] p-1.5 opacity-80 transition-colors hover:bg-white/15 hover:opacity-100", SIDEBAR_FOCUS_RING)}
                        aria-label="Recolher menu"
                        aria-expanded
                        title="Recolher menu"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                )}
            </div>

            <nav aria-label={navLabel} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 py-3">
                {sections.map((section) => (
                    <SidebarNavSection
                        key={section.id}
                        label={section.label}
                        open={sectionsState.isOpen(section.id)}
                        collapsed={collapsed}
                        reduceMotion={reduceMotion}
                        onToggle={() => sectionsState.toggle(section.id)}
                    >
                        {section.items.map((item) => (
                            <SidebarNavItem
                                key={item.href}
                                item={item}
                                href={item.href}
                                active={item.href === activeHref}
                                collapsed={collapsed}
                                badgeCount={item.badge ? (badges?.[item.badge] ?? 0) : 0}
                                reduceMotion={reduceMotion}
                                onNavigate={onNavigate}
                            />
                        ))}
                    </SidebarNavSection>
                ))}
            </nav>

            {footerItems && <ul className="shrink-0 space-y-1 border-t border-white/15 px-2 py-2">{footerItems(collapsed)}</ul>}

            {canCollapse && collapsed && (
                <div className="flex justify-center border-t border-white/15 p-2">
                    <button
                        type="button"
                        onClick={onToggleCollapsed}
                        className={cn("rounded-[4px] p-1.5 opacity-80 hover:bg-white/15 hover:opacity-100", SIDEBAR_FOCUS_RING)}
                        aria-label="Expandir menu"
                        aria-expanded={false}
                        title="Expandir menu"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            )}

            <SidebarFooter collapsed={collapsed} ownerName={ownerName} version={version} />
        </motion.aside>
    )
}
