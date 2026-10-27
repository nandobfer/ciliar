"use client"

import { useEffect } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { applyDocumentMode } from "@/lib/ui/document-theme"
import { LoginBackdrop } from "./LoginBackdrop"
import { LoginForm, type LoginFormProps } from "./LoginForm"

/**
 * Tela inicial de login — a primeira (e, por ora, única) tela pública do Opex. Fica **fora do
 * shell** (`src/app/login/page.tsx`), centralizada na viewport, com fundo de partículas e o
 * cartão de entrada. Mostra só os métodos habilitados para o protocolo de acesso (integração
 * Autenticação): e-mail e senha (com cadastro) e/ou "Entrar com Google".
 *
 * `isolate` cria um stacking context no `main` para que as camadas do fundo (`z-0`) fiquem
 * **acima** do `bg-background` e **abaixo** do conteúdo (`z-10`) — sem z-index negativo, que
 * esconderia as partículas atrás do fundo opaco.
 *
 * O app é claro, mas o login continua ESCURO (decisão do produto): `.dark` no `main` (já no HTML do
 * servidor, sem piscar) e no `<html>` enquanto a tela está aberta (toasts e popovers do `<body>`).
 */
export function LoginPage({ nextPath, notice, disabled, methods, signupAvailable }: LoginFormProps & { notice?: string }) {
    const reducedMotion = useReducedMotion()
    useEffect(() => applyDocumentMode("dark"), [])
    return (
        <main className="dark relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 text-foreground py-10">
            <LoginBackdrop />

            <motion.div
                initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="relative z-10 flex w-full max-w-sm flex-col items-center"
            >
                <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">Ciliar</h1>
                <p className="mt-2 text-base text-muted-foreground sm:text-lg">Entre para continuar</p>

                {notice && (
                    <p className="mt-4 w-full rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-center text-sm text-warning">{notice}</p>
                )}

                {(methods ?? ["google"]).length > 0 && (
                    <div className="mt-8 w-full rounded-xl border border-border/70 bg-card/80 p-6 shadow-[0_0_50px_-18px_hsl(var(--primary))] backdrop-blur-md">
                        <LoginForm nextPath={nextPath} disabled={disabled} methods={methods} signupAvailable={signupAvailable} />
                    </div>
                )}
            </motion.div>
        </main>
    )
}
