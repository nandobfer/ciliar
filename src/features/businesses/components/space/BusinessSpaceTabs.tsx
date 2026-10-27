"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"
import { usePermissions } from "@nandobfer/perfix/react"
import { cn } from "@/lib/utils"
import { activeNavHref } from "@/features/layout/navigation"
import { businessSpaceNavSection } from "./space-nav"

/**
 * Abas do espaço do negócio, na linha logo abaixo do cabeçalho (`/negocios/[id]/…`): Dashboard, Ficha
 * e os módulos que o perfil pode ver (`canSeeSpaceSection`). A barra da aba ativa desliza entre as
 * abas (movimento reduzido: troca direta); no celular, a linha rola na horizontal.
 */
export function BusinessSpaceTabs({ businessId }: { businessId: string }) {
    const pathname = usePathname()
    const reduceMotion = useReducedMotion() ?? false
    const { can } = usePermissions()
    const { items } = businessSpaceNavSection(businessId, can)
    const active = activeNavHref(pathname, items)

    return (
        <nav aria-label="Páginas do negócio" className="shrink-0 border-b border-border bg-card px-2 md:px-4">
            <ul className="-mb-px flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {items.map((item) => {
                    const selected = item.href === active
                    const Icon = item.icon
                    return (
                        <li key={item.href} className="relative shrink-0">
                            <Link
                                href={item.href}
                                scroll={item.scroll}
                                aria-current={selected ? "page" : undefined}
                                className={cn(
                                    "flex h-11 items-center gap-2 rounded-[6px] px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                    selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                <Icon className={cn("h-4 w-4 shrink-0", selected ? "text-primary" : "opacity-70")} aria-hidden />
                                {item.label}
                            </Link>
                            {selected && (
                                <motion.span
                                    layoutId={reduceMotion ? undefined : "business-tab-indicator"}
                                    transition={{ duration: 0.22, ease: "easeOut" }}
                                    className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary"
                                    aria-hidden
                                />
                            )}
                        </li>
                    )
                })}
            </ul>
        </nav>
    )
}
