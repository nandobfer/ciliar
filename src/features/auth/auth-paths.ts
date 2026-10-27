import type { AuthMethod } from "@/features/authentication/constants"

/** `error` devolvido ao `signIn` do navegador quando o método está desabilitado para o protocolo. */
export const METHOD_DISABLED_ERROR = "MetodoIndisponivel"

/** Provider do Auth.js de cada método. */
export const AUTH_PROVIDER_OF: Record<AuthMethod, string> = { google: "google", password: "credentials" }

/**
 * Método de autenticação de uma rota do Auth.js (`/api/auth/signin/<provider>` e
 * `/api/auth/callback/<provider>`); `null` para as demais (sessão, CSRF, providers, signout).
 */
export function authMethodOfPath(pathname: string): AuthMethod | null {
    const match = /\/api\/auth\/(?:signin|callback)\/([^/]+)\/?$/.exec(pathname)
    if (!match) return null
    const provider = match[1]
    if (provider === "google") return "google"
    if (provider === "credentials") return "password"
    return null
}
