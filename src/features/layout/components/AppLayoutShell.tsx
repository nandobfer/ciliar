"use client"

import type { ReactNode } from "react"
import { AppShell } from "./AppShell"
import { OpexNavItem } from "@/features/opex-agent/components/OpexNavItem"
import { BusinessSwitcher } from "@/features/businesses/components/BusinessSwitcher"
import { homeHrefOf } from "@/features/access/components/AccessProvider"
import { APP_NAV, PERSISTENT_PAGE_HREFS } from "../navigation"
import { usePermissions } from "@nandobfer/perfix/react"
import { INTEGRATION_IDS } from "@/lib/integrations/catalog"

interface AppLayoutShellProps {
    ownerName: string
    version?: string
    children: ReactNode
}

/** Agente Opex no rodapé do menu (somente com a permissão de usar o chat). */
const agentFooterItems = (collapsed: boolean) => <OpexNavItem collapsed={collapsed} />
/** Seletor de negócio no topo do menu (com `businesses.use`). */
const businessHeaderItems = (collapsed: boolean) => <BusinessSwitcher collapsed={collapsed} />

/** Casca pública do Ciliar, copiada do Opex. */
export function AppLayoutShell({ ownerName, version, children }: AppLayoutShellProps) {
    const { can, canAny } = usePermissions()
    const sections = APP_NAV.map(section => ({ ...section, items: section.items.filter(item =>
        item.href === "/negocios" ? canAny(["businesses.use", "businesses.view_all"])
            : !can("admin.access") ? false
            : item.href === "/usuarios" ? can("users.view") : item.href === "/perfis" ? can("roles.view") : canAny(INTEGRATION_IDS.map(id => `integrations.${id}.view`)),
    ) })).filter(section => section.items.length)
    return (
        <AppShell
            brand={{ name: "Ciliar", subtitle: can("admin.access") ? "Integrações" : "Negócios", homeHref: homeHrefOf(can) }}
            sections={sections}
            navLabel="Menu principal"
            persistentHrefs={PERSISTENT_PAGE_HREFS}
            ownerName={ownerName}
            version={version}
            sidebarFooterItems={can("opex.use") ? agentFooterItems : undefined}
            sidebarHeaderItems={can("businesses.use") ? businessHeaderItems : undefined}
        >
            {children}
        </AppShell>
    )
}
