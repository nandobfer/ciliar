import type { ReactNode } from "react"
import { AppLayoutShell } from "@/features/layout/components/AppLayoutShell"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { AccessProvider } from "@/features/access/components/AccessProvider"
import { PusherConfigBridge } from "@/lib/pusher/PusherConfigBridge"
import { getPusherPublicConfig } from "@/lib/pusher/public-config"

export default async function AppLayout({ children }: { children: ReactNode }) {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")
    const pusherConfig = await getPusherPublicConfig()
    return (
        <AccessProvider>
        <PusherConfigBridge config={pusherConfig} />
        <AppLayoutShell ownerName={session.user.name ?? "Usuário"} version={process.env.APP_VERSION}>
            {children}
        </AppLayoutShell>
        </AccessProvider>
    )
}
