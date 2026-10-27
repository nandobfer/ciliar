"use client"

import { AppErrorFallback } from "@/components/feedback/AppErrorFallback"

/** Erro dentro do app: a casca (barra lateral e cabeçalho) continua; só o conteúdo vira a tela de erro. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return <AppErrorFallback error={error} reset={reset} />
}
