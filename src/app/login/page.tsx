import { headers } from "next/headers"
import { LoginPage } from "@/features/auth/components/LoginPage"
import { loginErrorMessage } from "@/features/auth/login-errors"
import { appOrigin, requestAuthContext } from "@/features/auth/server/origin"
import { googleConfigured } from "@/features/authentication/server/settings"
import { signupAvailability } from "@/features/platform/server/settings"
import { dbConnect } from "@/lib/db"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

async function publicSignupAvailable(): Promise<boolean> {
    try {
        await dbConnect()
        return (await signupAvailability()).available
    } catch (error) {
        logger.warn({ err: error, action: "auth.signup-availability" }, "Não foi possível conferir o cadastro público")
        return false
    }
}

/**
 * `/login`: mostra só os métodos habilitados para o protocolo de acesso (integração Autenticação);
 * o servidor recusa os demais na rota do Auth.js e no cadastro.
 */
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string; error?: string }> }) {
    const params = await searchParams
    const { resolved, methods } = await requestAuthContext(new Headers(await headers()))
    const google = googleConfigured()
    const signupAvailable = methods.includes("password") && (await publicSignupAvailable())
    let notice = loginErrorMessage(params.erro, params.error)
    if (!resolved.allowed) notice = `Este endereço de acesso não está autorizado. Acesse por ${appOrigin()}.`
    else if (methods.includes("google") && !google && !notice) notice = "Login com Google não configurado: defina AUTH_GOOGLE_ID e AUTH_GOOGLE_SECRET no ambiente do servidor."
    return <LoginPage nextPath={params.next} notice={notice} disabled={!google} methods={methods} signupAvailable={signupAvailable} />
}
