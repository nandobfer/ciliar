import { DomainError } from "@/lib/api/route"
import { cachedAuthSettings } from "@/features/authentication/server/state"
import type { AuthMethod } from "@/features/authentication/constants"
import { resolveRequestOrigin, type ResolvedRequestOrigin } from "../request-origin"

/** Origem pública canônica (`APP_ORIGIN`): links gerados (orçamento, portfólio, convite) e fallback. */
export function appOrigin() {
    const configured = process.env.APP_ORIGIN || process.env.AUTH_URL
    if (!configured && process.env.NODE_ENV === "production") throw new DomainError(503, "Configure APP_ORIGIN para autenticação")
    return new URL(configured || `http://localhost:${process.env.PORT || "3101"}`).origin
}

export interface RequestAuthContext {
    resolved: ResolvedRequestOrigin
    /** Métodos habilitados para o protocolo da requisição (vazio em host não permitido). */
    methods: AuthMethod[]
}

/** Protocolo/origem da requisição e os métodos de autenticação que valem para ela. */
export async function requestAuthContext(headers: Headers, url?: string): Promise<RequestAuthContext> {
    const origin = appOrigin()
    const settings = await cachedAuthSettings()
    const resolved = resolveRequestOrigin({ headers, url: url ?? origin, appOrigin: origin, extraHosts: settings.extraHosts })
    return { resolved, methods: resolved.allowed ? settings.methods[resolved.protocol] : [] }
}

/**
 * Mutações aceitam somente a origem da própria requisição quando o host é permitido (`APP_ORIGIN`
 * ou um endereço de acesso adicional, em qualquer porta), além do marcador `x-ciliar-request: 1`.
 * O `APP_ORIGIN` exato continua aceito mesmo quando o proxy reescreve o `Host` (comportamento anterior).
 */
export async function assertMutationOrigin(request: Request, requireMarker = true) {
    const origin = request.headers.get("origin")
    const canonical = origin !== null && origin === appOrigin()
    const accepted = canonical || (origin !== null && await requestAuthContext(request.headers, request.url).then(({ resolved }) => resolved.allowed && origin === resolved.origin))
    if (!accepted || (requireMarker && request.headers.get("x-ciliar-request") !== "1")) {
        throw new DomainError(403, "Origem da requisição não autorizada", "INVALID_ORIGIN")
    }
}
