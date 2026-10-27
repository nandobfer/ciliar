import type { AccessProtocol } from "@/features/auth/request-origin"
import type { AuthMethod } from "./constants"
import type { AuthSettings } from "./schemas"

export interface AuthSettingsDto {
    settings: AuthSettings
    version: number
    updatedAt: string | null
    /** Host do `APP_ORIGIN` (sempre aceito, fora da lista). */
    canonicalHost: string
    /** Credenciais OAuth do Google no ambiente (`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`). */
    googleConfigured: boolean
    /** Como o servidor vê a requisição atual (para avisar antes de bloquear o próprio acesso). */
    current: { protocol: AccessProtocol; host: string; allowed: boolean; methods: AuthMethod[] } | null
}
