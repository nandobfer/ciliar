import { newBlock, type PortfolioBlock } from "./blocks"
import { PORTFOLIO_SECTION_LABELS, type PortfolioSectionKey } from "./constants"

/**
 * Modelos prontos e a conversão do portfólio antigo (M5) — módulo PURO. Os modelos montam a página
 * com o conteúdo disponível (seções em "todos os disponíveis", que acompanham os itens novos).
 */

export const PORTFOLIO_TEMPLATES = ["classic", "showcase", "minimal", "blank"] as const
export type PortfolioTemplate = (typeof PORTFOLIO_TEMPLATES)[number]
export const PORTFOLIO_TEMPLATE_INFO: Record<PortfolioTemplate, { label: string; description: string }> = {
    classic: { label: "Clássico", description: "Apresentação, serviços, sucessos, projetos, documentos e uma chamada para contato." },
    showcase: { label: "Vitrine", description: "Um sucesso em destaque, os projetos em carrossel e os sucessos em grade." },
    minimal: { label: "Minimalista", description: "Texto curto, a lista de serviços e um botão de contato." },
    blank: { label: "Página em branco", description: "Só o cabeçalho e o contato: monte do zero." },
}

export interface TemplateInfo {
    description: string | null
    counts: Record<PortfolioSectionKey, number>
    firstSuccessId: string | null
    /** Botão de contato: WhatsApp quando há telefone, senão e-mail. */
    hasPhone: boolean
}

const section = (source: PortfolioSectionKey, init: Partial<Parameters<typeof newBlock<"section">>[1]> = {}) => newBlock("section", { source, title: PORTFOLIO_SECTION_LABELS[source], mode: "all", ...init })

export function buildTemplate(template: PortfolioTemplate, info: TemplateInfo): PortfolioBlock[] {
    if (template === "blank") return []
    const has = (source: PortfolioSectionKey) => info.counts[source] > 0
    const contact = () => newBlock("button", { label: "Fale comigo", action: info.hasPhone ? "whatsapp" : "email", style: { background: "none", spacing: "lg", align: "center" } })
    const about = info.description?.trim() ? [newBlock("heading", { text: "Sobre" }), newBlock("text", { markdown: info.description.trim() })] : []
    if (template === "minimal") return [...(info.description?.trim() ? [newBlock("text", { markdown: info.description.trim() })] : []), ...(has("services") ? [section("services", { layout: "list" })] : []), contact()]
    if (template === "showcase") {
        return [
            ...(info.firstSuccessId ? [newBlock("featured", { source: "successes", refId: info.firstSuccessId, style: { background: "subtle", spacing: "lg", align: "left" } })] : []),
            ...(has("items") ? [section("items", { layout: "carousel" })] : []),
            ...(has("successes") ? [section("successes", { layout: "grid", columns: 3 })] : []),
            ...(has("services") ? [section("services", { layout: "grid", columns: 3, style: { background: "subtle", spacing: "md", align: "left" } })] : []),
            contact(),
        ]
    }
    return [
        ...about,
        ...(has("services") ? [section("services", { layout: "grid", columns: 3 })] : []),
        ...(has("successes") ? [section("successes", { layout: "grid", columns: 2, style: { background: "subtle", spacing: "md", align: "left" } })] : []),
        ...(has("items") ? [section("items", { layout: "grid", columns: 2 })] : []),
        ...(has("documents") ? [section("documents", { layout: "list" })] : []),
        newBlock("separator", { variant: "space", size: "md" }),
        contact(),
    ]
}

/** Portfólio antigo (seções e seleções) → blocos de seção, na ordem salva e só as visíveis. */
export interface LegacyPortfolio {
    sections?: { key: string; visible?: boolean | null }[] | null
    successes?: { id: string; showClient?: boolean | null }[] | null
    documents?: string[] | null
    services?: string[] | null
    /** Itens avulsos ativos já na ordem final. */
    items: string[]
}

export function blocksFromLegacy(legacy: LegacyPortfolio): PortfolioBlock[] {
    const keys: PortfolioSectionKey[] = ["services", "successes", "items", "documents"]
    const saved = (legacy.sections ?? []).filter((entry): entry is { key: PortfolioSectionKey; visible?: boolean | null } => (keys as string[]).includes(entry.key))
    const order = [...saved, ...keys.filter((key) => !saved.some((entry) => entry.key === key)).map((key) => ({ key, visible: true }))]
    const picks: Record<PortfolioSectionKey, { id: string; showClient: boolean }[]> = {
        services: (legacy.services ?? []).map((id) => ({ id, showClient: false })),
        successes: (legacy.successes ?? []).map((pick) => ({ id: pick.id, showClient: pick.showClient === true })),
        documents: (legacy.documents ?? []).map((id) => ({ id, showClient: false })),
        items: legacy.items.map((id) => ({ id, showClient: false })),
    }
    return order.filter((entry) => entry.visible !== false && picks[entry.key].length).map((entry) => section(entry.key, { mode: "picked", picks: [...new Map(picks[entry.key].map((pick) => [pick.id, pick])).values()].slice(0, 100) }))
}
