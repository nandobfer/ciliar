"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { AppShell } from "./AppShell"
import { OpexNavItem } from "@/features/opex-agent/components/OpexNavItem"
import { activeBusinessId, BusinessSwitcher } from "@/features/businesses/components/BusinessSwitcher"
import { BusinessThemeController } from "@/features/businesses/components/space/BusinessThemeController"
import { businessSpaceNavSection } from "@/features/businesses/components/space/space-nav"
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
    const pathname = usePathname()
    const canBusinesses = canAny(["businesses.use", "businesses.view_all"])
    // Negócio aberto: as páginas do espaço entram como seção própria e navegar entre elas não remonta a casca.
    const businessId = canBusinesses ? activeBusinessId(pathname) : null
    const nav = APP_NAV.map(section => ({ ...section, items: section.items.filter(item =>
        item.href === "/negocios" ? canBusinesses
            : !can("admin.access") ? false
            : item.href === "/usuarios" ? can("users.view") : item.href === "/perfis" ? can("roles.view") : canAny(INTEGRATION_IDS.map(id => `integrations.${id}.view`)),
    ) })).filter(section => section.items.length)
    const sections = businessId ? nav.flatMap(section => section.id === "negocios" ? [section, businessSpaceNavSection(businessId)] : [section]) : nav
    return (
        <AppShell
            brand={{ name: "Ciliar", subtitle: can("admin.access") ? "Integrações" : "Negócios", homeHref: homeHrefOf(can) }}
            sections={sections}
            navLabel="Menu principal"
            persistentHrefs={businessId ? [...PERSISTENT_PAGE_HREFS, `/negocios/${businessId}`] : PERSISTENT_PAGE_HREFS}
            ownerName={ownerName}
            version={version}
            sidebarFooterItems={can("opex.use") ? agentFooterItems : undefined}
            sidebarHeaderItems={can("businesses.use") ? businessHeaderItems : undefined}
        >
            <BusinessThemeController />
            {children}
        </AppShell>
    )
}
