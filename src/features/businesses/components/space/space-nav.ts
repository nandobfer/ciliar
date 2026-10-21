import { ClipboardList, Clock, FileText, LayoutDashboard, ReceiptText, Target, Trophy, type LucideIcon } from "lucide-react"
import type { NavSectionDef } from "@/features/layout/types"
import { BUSINESS_SPACE_SECTIONS, businessSpaceHref, type BusinessSpaceSlug } from "../../constants"

const ICONS: Record<BusinessSpaceSlug, LucideIcon> = {
    "": LayoutDashboard,
    ficha: ClipboardList,
    atividades: Clock,
    metas: Target,
    documentos: FileText,
    sucessos: Trophy,
    pedidos: ReceiptText,
}

/** Seção "Negócio" da barra lateral com as páginas do espaço do negócio aberto. */
export function businessSpaceNavSection(businessId: string): NavSectionDef {
    return {
        id: "negocio-espaco",
        label: "Negócio",
        items: BUSINESS_SPACE_SECTIONS.map((section) => ({ href: businessSpaceHref(businessId, section.slug), label: section.label, title: section.label, icon: ICONS[section.slug], scroll: false })),
    }
}
