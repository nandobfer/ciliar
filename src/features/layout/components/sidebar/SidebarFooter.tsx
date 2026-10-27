"use client"

import { useState } from "react"
import { KeyRound, LogOut } from "lucide-react"
import { PasswordChangeDialog } from "@/features/auth/components/PasswordChange"
import { cn } from "@/lib/utils"
import { useAppSession } from "@/features/access/components/AccessProvider"
import { SIDEBAR_FOCUS_RING } from "./sidebar-styles"

export function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return "?"
    if (parts.length === 1) return parts[0]![0]!.toUpperCase()
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

interface SidebarFooterProps {
    collapsed: boolean
    /** Nome da pessoa logada (sessão do servidor). */
    ownerName: string
    version?: string
}

/** Rodapé do menu (cópia do crm-marketing-campanhas): a pessoa logada, o perfil, Alterar senha e Sair; versão do app. */
export function SidebarFooter({ collapsed, ownerName, version }: SidebarFooterProps) {
    const { session, logout } = useAppSession()
    const name = session?.user.name || ownerName
    const role = session?.access.roles[0]?.nome ?? ""
    const [changing, setChanging] = useState(false)
    const passwordLabel = session?.user.hasPassword ? "Alterar senha" : "Criar senha"

    return (
        <div className="shrink-0 space-y-1 border-t border-white/15 p-2">
            <div className={cn("flex items-center gap-2.5 px-2 py-1.5", collapsed && "justify-center px-0")}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-[11px] font-semibold" aria-hidden={!collapsed} title={collapsed ? name : undefined}>
                    {initials(name)}
                </span>
                {!collapsed && (
                    <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-xs font-semibold">{name}</span>
                        <span className="truncate text-[11px] opacity-80">{[role, version && `v${version}`].filter(Boolean).join(" · ")}</span>
                    </span>
                )}
                {!collapsed && session && (
                    <button
                        type="button"
                        onClick={() => setChanging(true)}
                        className={cn("rounded-[4px] p-1.5 opacity-80 hover:bg-white/15 hover:opacity-100", SIDEBAR_FOCUS_RING)}
                        aria-label={passwordLabel}
                        title={passwordLabel}
                    >
                        <KeyRound className="h-4 w-4" />
                    </button>
                )}
                {!collapsed && (
                    <button
                        type="button"
                        onClick={logout}
                        className={cn("rounded-[4px] p-1.5 opacity-80 hover:bg-white/15 hover:opacity-100", SIDEBAR_FOCUS_RING)}
                        aria-label="Sair"
                        title="Sair"
                    >
                        <LogOut className="h-4 w-4" />
                    </button>
                )}
            </div>
            {changing && <PasswordChangeDialog hasPassword={session?.user.hasPassword === true} onClose={() => setChanging(false)} onDone={() => { setChanging(false); logout() }} />}
        </div>
    )
}
