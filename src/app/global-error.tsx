"use client"

import "./globals.css"
import { AppErrorFallback } from "@/components/feedback/AppErrorFallback"

/** Erro na raiz (inclusive no layout): substitui o documento inteiro, por isso tem <html> e <body>. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <html lang="pt-BR">
            <body className="min-h-screen bg-background font-sans antialiased">
                <AppErrorFallback error={error} reset={reset} />
            </body>
        </html>
    )
}
