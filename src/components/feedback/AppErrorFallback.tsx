"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, RefreshCw, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { isChunkLoadError, sessionStore, shouldReloadForChunk } from "@/lib/ui/chunk-reload"

export interface AppErrorFallbackProps {
    error: Error & { digest?: string }
    reset: () => void
    /** Recarregar a página (injetável nos testes). */
    reload?: () => void
}

/**
 * Tela das fronteiras de erro (`error.tsx` / `global-error.tsx`). Falha ao carregar código recarrega
 * sozinha uma vez; se continuar, pede para recarregar. Outros erros: "Tentar de novo" (`reset`) e o
 * código do erro (`digest`) — nunca a pilha nem detalhes internos.
 */
export function AppErrorFallback({ error, reset, reload = () => window.location.reload() }: AppErrorFallbackProps) {
    const chunk = isChunkLoadError(error)
    // Decide uma vez (a marca no sessionStorage impede o ciclo) e recarrega depois da montagem.
    const [reloading] = useState(() => chunk && shouldReloadForChunk(sessionStore()))
    useEffect(() => {
        if (reloading) reload()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reloading])
    return (
        <div role="alert" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 py-14 text-center">
            <div className="rounded-full bg-destructive/10 p-3">
                <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
            </div>
            <div className="max-w-md space-y-1">
                <p className="text-sm font-semibold text-foreground">{chunk ? (reloading ? "Recarregando a página…" : "Não foi possível carregar a página") : "Algo deu errado"}</p>
                <p className="text-xs text-muted-foreground">{chunk ? "A conexão com o servidor falhou no meio do carregamento. Verifique a conexão e tente de novo." : "Um erro inesperado interrompeu esta tela. Tente de novo; se continuar, recarregue a página."}</p>
                {!chunk && error.digest && <p className="text-[11px] text-muted-foreground">Código do erro: {error.digest}</p>}
            </div>
            {!reloading && (
                <div className="flex flex-wrap justify-center gap-2">
                    {!chunk && (
                        <Button size="sm" variant="outline" onClick={reset}>
                            <RotateCw className="mr-2 h-3.5 w-3.5" aria-hidden />
                            Tentar de novo
                        </Button>
                    )}
                    <Button size="sm" variant={chunk ? "default" : "ghost"} onClick={reload}>
                        <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden />
                        Recarregar
                    </Button>
                </div>
            )}
        </div>
    )
}
