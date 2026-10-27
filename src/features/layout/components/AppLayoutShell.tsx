"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { AppShell } from "./AppShell"
import { OpexNavItem } from "@/features/opex-agent/components/OpexNavItem"
import { activeBusinessId, BusinessSwitcher } from "@/features/businesses/components/BusinessSwitcher"
import { BusinessThemeController } from "@/features/businesses/components/space/BusinessThemeController"
import { BusinessSpaceTabs } from "@/features/businesses/components/space/BusinessSpaceTabs"
import { businessSpaceNavSection } from "@/features/businesses/components/space/space-nav"
import { homeHrefOf } from "@/features/access/components/AccessProvider"
import { APP_NAV, flattenNav, PERSISTENT_PAGE_HREFS } from "../navigation"
import { usePermissions } from "@nandobfer/perfix/react"
import { INTEGRATION_IDS } from "@/lib/integrations/catalog"
import { OrdersRealtime } from "@/features/orders/components/OrdersRealtime"
import { WorksRealtime } from "@/features/works/components/WorksRealtime"

import { businessRouteAccess, canReadModule } from "@/features/businesses/permissions"

interface AppLayoutShellProps {
    ownerName: string
    version?: string
    children: ReactNode
}

/** Agente Opex no rodapé do menu (somente com a permissão de usar o chat). */
const agentFooterItems = (collapsed: boolean) => <OpexNavItem collapsed={collapsed} />

/**
 * Casca do Ciliar (cópia da do crm-marketing-campanhas): a barra lateral só com os itens globais; o
 * seletor de negócio abre o caminho do cabeçalho e, com um negócio aberto, as páginas dele viram abas
 * logo abaixo do cabeçalho.
 */
export function AppLayoutShell({ ownerName, version, children }: AppLayoutShellProps) {
    const { can, canAny } = usePermissions()
    const pathname = usePathname()
    const canBusinesses = canAny(["businesses.use", "businesses.view_all"])
    // Negócio aberto: as páginas do espaço viram abas e navegar entre elas não remonta a casca.
    const businessId = canBusinesses ? activeBusinessId(pathname) : null
    // Telas do prestador (Negócios, Clientes, Pedidos e Trabalhos): a permissão do módulo (ou o suporte), sem o painel.
    const sections = APP_NAV.map(section => ({ ...section, items: section.items.filter(item =>
        businessRouteAccess(item.href) ? businessRouteAccess(item.href)!(can)
            : !can("admin.access") ? false
            : item.href === "/usuarios" ? can("users.view") : item.href === "/perfis" ? can("roles.view") : canAny(INTEGRATION_IDS.map(id => `integrations.${id}.view`)),
    ) })).filter(section => section.items.length)
    // Título no cabeçalho: no espaço do negócio, a aba aberta; fora dele, o item do menu.
    const titleItems = businessId ? businessSpaceNavSection(businessId, can).items : flattenNav(sections)
    return (
        <AppShell
            brand={{ name: "Ciliar", subtitle: can("admin.access") ? "Integrações" : "Negócios", homeHref: homeHrefOf(can) }}
            sections={sections}
            navLabel="Menu principal"
            persistentHrefs={businessId ? [...PERSISTENT_PAGE_HREFS, `/negocios/${businessId}`] : PERSISTENT_PAGE_HREFS}
            ownerName={ownerName}
            version={version}
            sidebarFooterItems={can("opex.use") ? agentFooterItems : undefined}
            context={canBusinesses ? <BusinessSwitcher /> : undefined}
            titleItems={titleItems}
            subheader={businessId ? <BusinessSpaceTabs businessId={businessId} /> : undefined}
        >
            <BusinessThemeController />
            {canReadModule(can, "orders") && can("businesses.use") && <OrdersRealtime />}
            {canReadModule(can, "works") && can("businesses.use") && <WorksRealtime />}
            {children}
        </AppShell>
    )
}
