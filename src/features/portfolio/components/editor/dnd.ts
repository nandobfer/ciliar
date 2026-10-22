import type { BlockTarget, PortfolioBlockType } from "../../blocks"
import type { PortfolioSectionKey } from "../../constants"

/** Dados do arrastar-e-soltar do editor (dnd-kit): o que é arrastado e onde pode cair. */

export type DragData =
    | { kind: "new"; type: PortfolioBlockType; source?: PortfolioSectionKey; label: string }
    | { kind: "content"; source: PortfolioSectionKey; id: string; label: string }
    | { kind: "media"; id: string; label: string }
    | { kind: "block"; id: string; type: PortfolioBlockType; label: string }

export type DropData = { kind: "slot"; target: BlockTarget } | { kind: "section"; blockId: string; source: PortfolioSectionKey }

/** Tipo de bloco que o arraste cria/move (conteúdo vira destaque; mídia vira imagem). */
export function dragBlockType(drag: DragData): PortfolioBlockType {
    if (drag.kind === "content") return "featured"
    if (drag.kind === "media") return "image"
    return drag.type
}

export const slotId = (target: BlockTarget) => `slot:${target.parentId ?? "root"}:${target.column ?? 0}:${target.index}`
