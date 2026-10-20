"use client"
import { usePermissions } from "@nandobfer/perfix/react"
import { ViewAsSelector } from "@/features/view-as/components/ViewAsSelector"
import { ViewAsBanner } from "@/features/view-as/components/ViewAsBanner"

/** Header copiado de apps/admin/src/features/layout/app-layout.tsx do Shekinah. */
export function ViewAsControls() {
    const { realIsAdmin } = usePermissions()
    return <>
        {realIsAdmin && <div className="flex h-12 shrink-0 items-center justify-end border-b border-border px-4"><ViewAsSelector /></div>}
        <ViewAsBanner />
    </>
}
