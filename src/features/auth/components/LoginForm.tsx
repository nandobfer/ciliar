"use client"

import { useState } from "react"
import Link from "next/link"
import { signIn } from "next-auth/react"
import { useQueryClient } from "@tanstack/react-query"
import { syncViewAsCookies, VIEW_AS_STORAGE_KEY } from "@nandobfer/perfix/react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { resetPusherClient } from "@/lib/pusher/client"
import { HOME_HREF } from "@/features/layout/navigation"
import { LOGIN_ERROR_MESSAGES } from "../login-errors"

/** Só aceita destino relativo do app (sem esquema nem `//`), evitando open redirect. */
function safeNext(value: string | undefined): string | null {
    if (!value) return null
    if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) return null
    return value
}

/** Marca do Google (cores oficiais), sem dependência externa. */
function GoogleMark() {
    return (
        <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
    )
}

export function LoginForm({ nextPath, disabled = false }: { nextPath?: string; disabled?: boolean }) {
    const queryClient = useQueryClient()
    const [pending, setPending] = useState(false)

    const start = async () => {
        setPending(true)
        // Nada da sessão anterior (simulação, cache, assinaturas) sobrevive à troca de conta.
        sessionStorage.removeItem(VIEW_AS_STORAGE_KEY)
        syncViewAsCookies(null)
        resetPusherClient()
        queryClient.clear()
        try {
            await signIn("google", { redirectTo: safeNext(nextPath) ?? HOME_HREF })
        } catch {
            setPending(false)
            toast.error(LOGIN_ERROR_MESSAGES.falha)
        }
    }

    return (
        <div className="space-y-4">
            <Button type="button" variant="outline" className="w-full gap-2" disabled={disabled || pending} onClick={() => void start()}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />}
                {pending ? "Redirecionando…" : "Entrar com Google"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
                Novo por aqui? A conta é criada no primeiro acesso. Ao continuar, você deverá aceitar os{" "}
                <Link href="/termos" className="text-primary underline underline-offset-2 hover:text-primary/80">termos de uso</Link> e a{" "}
                <Link href="/privacidade" className="text-primary underline underline-offset-2 hover:text-primary/80">política de privacidade</Link>.
            </p>
        </div>
    )
}
