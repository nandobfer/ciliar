import { ClipboardList, Clock, FileText, Globe, Hammer, LayoutDashboard, ReceiptText, Target, Trophy, type LucideIcon } from "lucide-react"
import type { NavSectionDef } from "@/features/layout/types"
import { BUSINESS_SPACE_SECTIONS, businessSpaceHref, type BusinessSpaceSlug } from "../../constants"
import { BUSINESS_SPACE_SEGMENT_MODULES, canReadModule } from "../../permissions"

const ICONS: Record<BusinessSpaceSlug, LucideIcon> = {
    "": LayoutDashboard,
    ficha: ClipboardList,
    atividades: Clock,
    metas: Target,
    documentos: FileText,
    sucessos: Trophy,
    pedidos: ReceiptText,
    trabalhos: Hammer,
    portfolio: Globe,
}

/** A página do espaço aparece com a visualização do módulo dela (ou o suporte); dashboard e ficha, sempre. */
export function canSeeSpaceSection(slug: BusinessSpaceSlug, can: (key: string) => boolean): boolean {
    const area = BUSINESS_SPACE_SEGMENT_MODULES[slug]
    return !area || canReadModule(can, area)
}

/** Páginas do espaço do negócio aberto (só as permitidas): abas do cabeçalho e título da página. */
export function businessSpaceNavSection(businessId: string, can: (key: string) => boolean = () => true): NavSectionDef {
    return {
        id: "negocio-espaco",
        label: "Negócio",
        items: BUSINESS_SPACE_SECTIONS.filter((section) => canSeeSpaceSection(section.slug, can)).map((section) => ({ href: businessSpaceHref(businessId, section.slug), label: section.label, title: section.label, icon: ICONS[section.slug], scroll: false })),
    }
}
