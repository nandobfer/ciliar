"use client"

import { useEffect } from "react"
import { reloadOnChunkError } from "@/lib/ui/chunk-reload"

/** Recarrega a página uma vez quando um pedaço do código não carrega (conexão caiu ou nova publicação). */
export function ChunkReloadGuard() {
    useEffect(() => {
        const onError = (event: ErrorEvent) => void reloadOnChunkError(event.error ?? event.message)
        const onRejection = (event: PromiseRejectionEvent) => void reloadOnChunkError(event.reason)
        window.addEventListener("error", onError)
        window.addEventListener("unhandledrejection", onRejection)
        return () => {
            window.removeEventListener("error", onError)
            window.removeEventListener("unhandledrejection", onRejection)
        }
    }, [])
    return null
}
