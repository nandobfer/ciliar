import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"
import { cn } from "@/lib/utils"
import { QueryProvider } from "@/lib/react-query/QueryProvider"
import { Toaster } from "@/components/ui/toast"
import { MotionProvider } from "@/components/motion/MotionProvider"
import { CtrlEnterSubmit } from "@/components/ctrl-enter-submit"
import { EditorModeShortcut } from "@/components/editor-mode-shortcut"

const inter = localFont({
    src: "./fonts/inter-latin-variable.woff2",
    variable: "--font-sans",
    weight: "100 900",
    style: "normal",
    display: "swap",
})

/**
 * Sempre renderizado por requisição: o layout lê o ambiente do servidor (dono do app, config do
 * Pusher no banco). Estático, o `next build` — que roda no Docker SEM o `.env` — congelaria os
 * valores do build (ex.: "Usuário local" no rodapé do menu).
 */
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Ciliar",
    description: "Ciliar — integrações e infraestrutura",
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    // Key e cluster/URL do Pusher vêm da integração (banco → .env), não do build.
    return (
        // Claro por padrão; o modo escuro (`.dark` no <html>) vem do negócio aberto, das páginas públicas dele e do login.
        <html lang="pt-BR" suppressHydrationWarning>
            <body className={cn("min-h-screen bg-background font-sans antialiased", inter.variable)}>
                <CtrlEnterSubmit />
                <EditorModeShortcut />
                <QueryProvider>
                    <MotionProvider>
                        {children}
                        <Toaster richColors position="top-right" />
                    </MotionProvider>
                </QueryProvider>
            </body>
        </html>
    )
}
