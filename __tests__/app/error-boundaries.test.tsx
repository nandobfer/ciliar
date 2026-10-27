// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import AppError from "@/app/(app)/error"
import { AppErrorFallback } from "@/components/feedback/AppErrorFallback"
import { CHUNK_RELOAD_STORAGE_KEY } from "@/lib/ui/chunk-reload"

afterEach(() => {
    cleanup()
    window.sessionStorage.clear()
})

describe("fronteiras de erro", () => {
    it("erro comum: 'Algo deu errado', Tentar de novo chama reset e mostra só o digest", () => {
        const reset = vi.fn()
        render(<AppError error={Object.assign(new Error("detalhe interno sensível"), { digest: "abc123" })} reset={reset} />)
        expect(screen.getByText("Algo deu errado")).toBeTruthy()
        expect(screen.getByText("Código do erro: abc123")).toBeTruthy()
        expect(screen.queryByText(/detalhe interno/)).toBeNull()
        fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }))
        expect(reset).toHaveBeenCalledOnce()
    })

    it("falha ao carregar código: recarrega sozinha uma vez; na segunda pede para recarregar", () => {
        const reload = vi.fn()
        const chunkError = Object.assign(new Error("Failed to load chunk /_next/static/chunks/a.js"), { name: "ChunkLoadError" })
        render(<AppErrorFallback error={chunkError} reset={vi.fn()} reload={reload} />)
        expect(reload).toHaveBeenCalledOnce()
        expect(screen.getByText("Recarregando a página…")).toBeTruthy()
        expect(window.sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY)).toBeTruthy()
        cleanup()

        const again = vi.fn()
        render(<AppErrorFallback error={chunkError} reset={vi.fn()} reload={again} />)
        expect(again).not.toHaveBeenCalled()
        expect(screen.getByText("Não foi possível carregar a página")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Recarregar" }))
        expect(again).toHaveBeenCalledOnce()
    })
})
