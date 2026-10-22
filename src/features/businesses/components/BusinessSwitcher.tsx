"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Check, ChevronsUpDown, LayoutGrid, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { SidebarTooltip } from "@/features/layout/components/sidebar/SidebarTooltip"
import { SIDEBAR_FOCUS_RING, sidebarItemVariants } from "@/features/layout/components/sidebar/sidebar-styles"
import { useAppSession } from "@/features/access/components/AccessProvider"
import { useBusinesses, useBusinessesRealtime } from "../hooks/useBusinesses"
import { BusinessAvatar } from "./BusinessAvatar"

const LABEL = "Negócio"

/** Negócio ativo na URL (`/negocios/[id]`). */
export const activeBusinessId = (pathname: string) => /^\/negocios\/([a-f\d]{24})(?:\/|$)/i.exec(pathname)?.[1] ?? null

/**
 * Seletor de negócio no topo da barra lateral (com "Novo negócio"): troca o negócio ativo da URL.
 * Arquivados não aparecem; no limite do perfil, "Novo negócio" fica indisponível com o aviso.
 */
export function BusinessSwitcher({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
    const router = useRouter()
    const pathname = usePathname()
    const reduceMotion = useReducedMotion() ?? false
    const { session } = useAppSession()
    const [open, setOpen] = useState(false)
    const query = useBusinesses()
    useBusinessesRealtime(session?.user.id ?? null, !session?.access.simulation)
    const active = (query.data?.items ?? []).filter((item) => item.status === "active")
    const currentId = activeBusinessId(pathname)
    const current = active.find((item) => item.id === currentId) ?? null
    const capacity = query.data?.capacity
    const go = (href: string) => {
        setOpen(false)
        onNavigate?.()
        router.push(href)
    }

    const trigger = (
        <button type="button" aria-label={collapsed ? `${LABEL}: ${current?.name ?? "selecionar"}` : undefined} aria-expanded={open} aria-haspopup="dialog" className={cn("block w-full rounded-[4px]", SIDEBAR_FOCUS_RING)}>
            <motion.div
                variants={sidebarItemVariants}
                initial="hidden"
                animate="show"
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                    "relative flex w-full items-center gap-3 rounded-[4px] px-3 py-2 text-sm transition-colors",
                    open ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    collapsed && "justify-center px-0 py-2",
                )}
            >
                {current ? <BusinessAvatar business={current} className="h-7 w-7" /> : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-sidebar-border"><LayoutGrid className="h-4 w-4" aria-hidden /></span>}
                {!collapsed && (
                    <>
                        <span className="min-w-0 flex-1 truncate text-left">{current?.name ?? "Selecionar negócio"}</span>
                        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                    </>
                )}
            </motion.div>
        </button>
    )

    return (
        <li>
            <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
                <SidebarTooltip label={current ? `${LABEL}: ${current.name}` : "Selecionar negócio"} enabled={collapsed && !open}>
                    <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
                </SidebarTooltip>
                <AnimatePresence>
                    {open && (
                        <PopoverPrimitive.Portal forceMount>
                            <PopoverPrimitive.Content forceMount asChild side="right" align="start" sideOffset={12} collisionPadding={12} aria-label="Selecionar negócio">
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, x: -8 }}
                                    animate={{ opacity: 1, scale: 1, x: 0 }}
                                    exit={{ opacity: 0, scale: 0.96, x: -6, transition: { duration: 0.12 } }}
                                    transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }}
                                    style={{ transformOrigin: "var(--radix-popover-content-transform-origin)" }}
                                    className="z-50 w-72 overflow-hidden rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-2xl shadow-primary/10"
                                >
                                    <p className="px-2 pb-1.5 pt-1 text-xs font-semibold text-muted-foreground">Seus negócios</p>
                                    <ul className="max-h-72 space-y-0.5 overflow-y-auto">
                                        {query.isLoading && <li className="px-2 py-1.5 text-sm text-muted-foreground">Carregando…</li>}
                                        {!query.isLoading && !active.length && <li className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum negócio ativo</li>}
                                        {active.map((item) => (
                                            <li key={item.id}>
                                                <button type="button" onClick={() => go(`/negocios/${item.id}`)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted" aria-current={item.id === currentId ? "true" : undefined}>
                                                    <BusinessAvatar business={item} className="h-7 w-7" />
                                                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                                                    {item.id === currentId && <Check className="h-4 w-4 text-primary" aria-hidden />}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="mt-1.5 space-y-0.5 border-t pt-1.5">
                                        {capacity?.canCreate !== false || capacity.vacancy === false ? (
                                            <button type="button" disabled={!capacity?.canCreate} onClick={() => go("/negocios/novo")} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60">
                                                <Plus className="h-4 w-4 text-primary" aria-hidden /> Novo negócio
                                            </button>
                                        ) : null}
                                        {capacity?.canCreate === false && !capacity.vacancy && <p className="px-2 pb-1 text-[11px] text-warning">Limite de negócios ativos do seu perfil atingido: arquive um para criar outro.</p>}
                                        <Link href="/negocios" onClick={() => { setOpen(false); onNavigate?.() }} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                                            <LayoutGrid className="h-4 w-4 text-muted-foreground" aria-hidden /> Gerenciar negócios
                                        </Link>
                                    </div>
                                </motion.div>
                            </PopoverPrimitive.Content>
                        </PopoverPrimitive.Portal>
                    )}
                </AnimatePresence>
            </PopoverPrimitive.Root>
        </li>
    )
}
