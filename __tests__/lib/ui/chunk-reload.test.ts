import { describe, expect, it, vi } from "vitest"
import { CHUNK_RELOAD_STORAGE_KEY, CHUNK_RELOAD_WINDOW_MS, isChunkLoadError, shouldReloadForChunk } from "@/lib/ui/chunk-reload"

const memory = () => {
    const data = new Map<string, string>()
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), data }
}

describe("isChunkLoadError", () => {
    it("reconhece as variantes do erro de carregamento de código", () => {
        const named = Object.assign(new Error("x"), { name: "ChunkLoadError" })
        expect(isChunkLoadError(named)).toBe(true)
        expect(isChunkLoadError(new Error("Failed to load chunk /_next/static/chunks/4c7c44634a6d069e.js from module 487783"))).toBe(true)
        expect(isChunkLoadError(new Error("Loading chunk 123 failed."))).toBe(true)
        expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/a.js"))).toBe(true)
        expect(isChunkLoadError("Uncaught ChunkLoadError: Failed to load chunk /a.js")).toBe(true)
    })
    it("ignora erros comuns", () => {
        expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false)
        expect(isChunkLoadError(null)).toBe(false)
        expect(isChunkLoadError({ message: 42 })).toBe(false)
    })
})

describe("shouldReloadForChunk", () => {
    it("permite uma recarga e bloqueia a segunda dentro da janela", () => {
        const storage = memory()
        expect(shouldReloadForChunk(storage, 1_000)).toBe(true)
        expect(storage.data.get(CHUNK_RELOAD_STORAGE_KEY)).toBe("1000")
        expect(shouldReloadForChunk(storage, 1_000 + CHUNK_RELOAD_WINDOW_MS - 1)).toBe(false)
        expect(shouldReloadForChunk(storage, 1_000 + CHUNK_RELOAD_WINDOW_MS)).toBe(true)
    })
    it("sem sessionStorage (ou bloqueado) não recarrega", () => {
        expect(shouldReloadForChunk(null)).toBe(false)
        expect(shouldReloadForChunk({ getItem: vi.fn(() => { throw new Error("SecurityError") }), setItem: vi.fn() })).toBe(false)
    })
})
