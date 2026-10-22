"use client"

import { createContext, useContext } from "react"
import type { BlockTarget, PortfolioBlock } from "../../blocks"
import type { ResolvedBlock } from "../../resolve"
import type { PortfolioDto } from "../../types"

/** Estado compartilhado pelos painéis do editor do portfólio. */
export interface PortfolioEditorValue {
    portfolio: PortfolioDto
    blocks: PortfolioBlock[]
    /** Blocos resolvidos para exibição (inclusive os de dentro das colunas), por id. */
    resolved: ReadonlyMap<string, ResolvedBlock>
    selected: string | null
    select: (id: string | null) => void
    /** Troca os blocos (com Desfazer). `key` junta alterações seguidas do mesmo campo num passo só. */
    change: (next: PortfolioBlock[], key?: string) => void
    /** Insere um bloco novo: no destino ou depois do selecionado (ou no fim). Seleciona o novo. */
    insert: (block: PortfolioBlock, target?: BlockTarget) => void
    readOnly: boolean
    /** Rota autenticada de um arquivo do negócio (com `basePath`). */
    fileUrl: (fileId: string) => string
    announce: (message: string) => void
}

export const PortfolioEditorContext = createContext<PortfolioEditorValue | null>(null)

export function usePortfolioEditor(): PortfolioEditorValue {
    const value = useContext(PortfolioEditorContext)
    if (!value) throw new Error("usePortfolioEditor fora do editor do portfólio")
    return value
}
