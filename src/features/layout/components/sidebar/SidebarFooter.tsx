"use client"

import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SIDEBAR_FOCUS_RING } from "./sidebar-styles"
import { useAppSession } from "@/features/access/components/AccessProvider"
import { Button } from "@/components/ui/button"

export function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return "?"
    if (parts.length === 1) return parts[0]![0]!.toUpperCase()
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

interface SidebarFooterProps {
    collapsed: boolean
    /** Dono do app (uso pessoal): `APP_OWNER_NAME`. */
    ownerName: string
    version?: string
}

/**
 * Mesmo rodapé do Opex, sem logout: o avatar informa que esta base tem acesso público.
 */
export function SidebarFooter({ collapsed, ownerName, version }: SidebarFooterProps) {
    const { logout } = useAppSession()
    if (collapsed) {
        return (
            <div className="flex shrink-0 justify-center border-t border-sidebar-border p-2">
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            aria-label={ownerName}
                            title={ownerName}
                            className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-full bg-primary/25 text-[11px] font-semibold text-sidebar-foreground ring-1 ring-primary/40 transition-colors hover:bg-primary/40",
                                SIDEBAR_FOCUS_RING,
                            )}
                        >
                            {initials(ownerName)}
                        </button>
                    </PopoverTrigger>
                    <PopoverContent side="right" align="start" className="w-56 p-1">
                        <div className="px-2 py-1.5">
                            <p className="truncate text-sm font-semibold">{ownerName}</p>
                        </div>
                        <Button variant="ghost" className="w-full justify-start" onClick={logout}>Sair</Button>
                    </PopoverContent>
                </Popover>
            </div>
        )
    }

    return (
        <div className="shrink-0 border-t border-sidebar-border p-2">
            <div className="flex items-center gap-2.5 px-2 py-1.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/25 text-[11px] font-semibold text-sidebar-foreground ring-1 ring-primary/40" aria-hidden>
                    {initials(ownerName)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-xs font-semibold">{ownerName}</span>
                    {version && <span className="truncate text-[11px] opacity-70">v{version}</span>}
                </span>
            </div>
            <Button variant="ghost" className="w-full justify-start" onClick={logout}>Sair</Button>
        </div>
    )
}
