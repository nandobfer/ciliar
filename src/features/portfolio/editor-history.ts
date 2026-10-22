/**
 * Desfazer/Refazer do editor do portfólio (M5) — módulo PURO. Até `UNDO_LIMIT` passos; alterações
 * seguidas com a mesma chave (ex.: digitar no mesmo bloco) em menos de `COALESCE_MS` viram um passo só.
 */

export const UNDO_LIMIT = 100
export const COALESCE_MS = 1000

export interface EditorHistory<T> {
    past: T[]
    present: T
    future: T[]
    lastKey: string | null
    lastAt: number
}

export const startHistory = <T,>(present: T): EditorHistory<T> => ({ past: [], present, future: [], lastKey: null, lastAt: 0 })

export function pushHistory<T>(history: EditorHistory<T>, next: T, options: { key?: string | null; now?: number } = {}): EditorHistory<T> {
    if (Object.is(next, history.present)) return history
    const now = options.now ?? Date.now()
    const key = options.key ?? null
    if (key && key === history.lastKey && now - history.lastAt < COALESCE_MS) return { ...history, present: next, future: [], lastAt: now }
    return { past: [...history.past, history.present].slice(-UNDO_LIMIT), present: next, future: [], lastKey: key, lastAt: now }
}

export function undoHistory<T>(history: EditorHistory<T>): EditorHistory<T> {
    const previous = history.past.at(-1)
    if (previous === undefined) return history
    return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future], lastKey: null, lastAt: 0 }
}

export function redoHistory<T>(history: EditorHistory<T>): EditorHistory<T> {
    const [next, ...rest] = history.future
    if (next === undefined) return history
    return { past: [...history.past, history.present].slice(-UNDO_LIMIT), present: next, future: rest, lastKey: null, lastAt: 0 }
}
