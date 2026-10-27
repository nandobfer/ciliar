"use client"
import { usePermissions } from "@nandobfer/perfix/react"
import { ViewAsSelector } from "@/features/view-as/components/ViewAsSelector"
import { ViewAsBanner } from "@/features/view-as/components/ViewAsBanner"

/** Cabeçalho das telas fora da casca (onboarding, sem acesso): o da casca (`AppShell`) já traz o seletor. */
export function ViewAsControls() {
    const { realIsAdmin } = usePermissions()
    return <>
        {realIsAdmin && <div className="flex h-14 shrink-0 items-center justify-end border-b border-border bg-card px-4"><ViewAsSelector /></div>}
        <ViewAsBanner />
    </>
}
