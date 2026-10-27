/**
 * Falha ao carregar um pedaço do código do cliente (ChunkLoadError do Next/Turbopack): acontece com
 * uma conexão que cai no meio (ERR_CONNECTION_TIMED_OUT) ou com uma aba aberta durante uma nova
 * publicação. A saída é recarregar a página — UMA vez a cada `CHUNK_RELOAD_WINDOW_MS`, para nunca
 * entrar em ciclo quando a rede continua fora.
 */
export const CHUNK_RELOAD_STORAGE_KEY = "ciliar:chunk-reload-at"
export const CHUNK_RELOAD_WINDOW_MS = 30_000

const CHUNK_MESSAGES = [/failed to load chunk/i, /loading chunk [\w-]+ failed/i, /loading css chunk/i, /failed to fetch dynamically imported module/i, /importing a module script failed/i, /error loading dynamically imported module/i]

export function isChunkLoadError(error: unknown): boolean {
    if (!error || typeof error !== "object") return typeof error === "string" && CHUNK_MESSAGES.some((pattern) => pattern.test(error))
    const { name, message } = error as { name?: unknown; message?: unknown }
    if (name === "ChunkLoadError") return true
    return typeof message === "string" && CHUNK_MESSAGES.some((pattern) => pattern.test(message))
}

type ReloadStorage = Pick<Storage, "getItem" | "setItem">

/** Pode recarregar agora? Grava a marca quando sim. Sem `sessionStorage` (bloqueado), não recarrega. */
export function shouldReloadForChunk(storage: ReloadStorage | null | undefined, now = Date.now()): boolean {
    if (!storage) return false
    try {
        const last = Number(storage.getItem(CHUNK_RELOAD_STORAGE_KEY) ?? 0)
        if (Number.isFinite(last) && last > 0 && now - last < CHUNK_RELOAD_WINDOW_MS) return false
        storage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now))
        return true
    } catch {
        return false
    }
}

export const sessionStore = (): ReloadStorage | null => {
    try {
        return typeof window === "undefined" ? null : window.sessionStorage
    } catch {
        return null
    }
}

/** Recarrega a página se o erro for de carregamento de código e ainda não recarregou há pouco. */
export function reloadOnChunkError(error: unknown, reload: () => void = () => window.location.reload()): boolean {
    if (!isChunkLoadError(error) || !shouldReloadForChunk(sessionStore())) return false
    reload()
    return true
}
