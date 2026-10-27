/** Métodos de autenticação por protocolo de acesso (módulo puro: tela, servidor e agente). */
import type { AccessProtocol } from "@/features/auth/request-origin"

/** Singleton em `auth_settings`. */
export const AUTH_SETTINGS_ID = "global"

export const AUTH_METHODS = ["google", "password"] as const
export type AuthMethod = (typeof AUTH_METHODS)[number]

export const AUTH_METHOD_LABELS: Record<AuthMethod, { label: string; description: string }> = {
    google: { label: "Google", description: "Entrar com Google (credenciais OAuth no ambiente)" },
    password: { label: "E-mail e senha", description: "Formulário de e-mail e senha e cadastro com senha" },
}

export const ACCESS_PROTOCOL_LABELS: Record<AccessProtocol, { label: string; description: string }> = {
    http: { label: "Acesso via HTTP", description: "Ex.: http://217.77.3.47:4003" },
    https: { label: "Acesso via HTTPS", description: "Ex.: https://ciliar.nandoburgos.dev" },
}

/** Limite de endereços de acesso adicionais. */
export const MAX_EXTRA_HOSTS = 20
