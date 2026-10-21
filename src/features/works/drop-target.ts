import { arrayMove } from "@dnd-kit/sortable"
import type { WorkSortKey } from "./constants"
import { computeDropOrderInList } from "./logic"

/**
 * Lógica pura do arraste de cards no Kanban (vários contêineres), copiada do quadro de Tarefas do Opex.
 * `ColumnItems` = ids por coluna, na ordem exibida.
 */
export type ColumnItems = Readonly<Record<string, readonly string[]>>

/**
 * Durante o arraste: o card sai de `from` e entra em `to` na posição do card sob o cursor (ou depois
 * dele, se o cursor passou da metade; no fim, se está sobre a área vazia da coluna).
 */
export function moveBetweenColumns(items: ColumnItems, id: string, from: string, to: string, overId: string, below: boolean): ColumnItems {
    const source = (items[from] ?? []).filter((item) => item !== id)
    const target = (items[to] ?? []).filter((item) => item !== id)
    const overIndex = target.indexOf(overId)
    const index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : target.length
    target.splice(index, 0, id)
    return { ...items, [from]: source, [to]: target }
}

/**
 * Ao soltar: posição final na coluna `target` e a `position` a enviar (só na ordenação Manual; nas
 * demais o card se acomoda pela ordenação). `null` = nada mudou (mesma coluna e mesma posição, ou
 * reordenar na mesma coluna fora da ordenação Manual).
 */
export function finalDropPosition(
    current: ColumnItems,
    original: ColumnItems,
    work: { id: string },
    origin: string,
    target: string,
    overId: string,
    sort: WorkSortKey,
    positionOf: (id: string) => number,
): { items: ColumnItems; position?: number } | null {
    let list = [...(current[target] ?? [])]
    if (!list.includes(work.id)) {
        const overIndex = list.indexOf(overId)
        list.splice(overIndex === -1 ? list.length : overIndex, 0, work.id)
    } else {
        const from = list.indexOf(work.id)
        const to = list.indexOf(overId)
        if (to !== -1 && from !== to) list = arrayMove(list, from, to)
    }

    if (origin === target) {
        if (sort !== "manual") return null
        const before = original[target] ?? []
        if (before.length === list.length && before.every((id, index) => list[index] === id)) return null
    }

    const items: ColumnItems = {
        ...current,
        ...(origin !== target ? { [origin]: (current[origin] ?? []).filter((id) => id !== work.id) } : {}),
        [target]: list,
    }
    if (sort !== "manual") return { items }
    const index = list.indexOf(work.id)
    const orders = list.filter((id) => id !== work.id).map(positionOf)
    return { items, position: computeDropOrderInList(orders, index) }
}
