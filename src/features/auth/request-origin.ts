/**
 * Protocolo e origem da requisição (módulo puro: servidor e testes). O app pode estar atrás de
 * proxy reverso (Cloudflare) ou ser acessado direto pela porta (`http://IP:porta`).
 *
 * - Protocolo: primeiro valor de `X-Forwarded-Proto` (`http`/`https`); sem ele, o da URL da conexão.
 * - Host: primeiro valor de `X-Forwarded-Host`; sem ele, `Host`.
 * - Só hosts permitidos (o do `APP_ORIGIN` + os "Endereços de acesso adicionais" da integração
 *   Autenticação, sem porta: qualquer porta vale) geram origem própria; os demais caem no `APP_ORIGIN`
 *   e ficam marcados `allowed: false` (autenticação e mutações recusam).
 */

export const ACCESS_PROTOCOLS = ["http", "https"] as const
export type AccessProtocol = (typeof ACCESS_PROTOCOLS)[number]

export interface ResolvedRequestOrigin {
    protocol: AccessProtocol
    /** `host[:porta]` da requisição (ou do `APP_ORIGIN` quando não permitido). */
    host: string
    origin: string
    /** O host está entre os permitidos. */
    allowed: boolean
}

const firstValue = (value: string | null | undefined) => value?.split(",")[0]?.trim() || null

export function requestProtocol(headers: Headers, url: string): AccessProtocol {
    const forwarded = firstValue(headers.get("x-forwarded-proto"))?.toLowerCase().replace(/:$/, "")
    if (forwarded === "http" || forwarded === "https") return forwarded
    try {
        return new URL(url).protocol === "https:" ? "https" : "http"
    } catch {
        return "http"
    }
}

export function requestHost(headers: Headers, url: string): string | null {
    const host = firstValue(headers.get("x-forwarded-host")) ?? firstValue(headers.get("host"))
    if (host) return host.toLowerCase()
    try {
        return new URL(url).host.toLowerCase() || null
    } catch {
        return null
    }
}

/** Nome do host (sem porta) de um `host[:porta]` vindo de cabeçalho; `null` se malformado. */
export function hostnameOf(host: string): string | null {
    if (!host || /[\s/\\@?#]/.test(host)) return null
    try {
        const url = new URL(`http://${host}`)
        return url.hostname.toLowerCase() || null
    } catch {
        return null
    }
}

/**
 * Normaliza um endereço da lista de acessos adicionais: só o host (domínio, IPv4 ou IPv6), sem
 * protocolo, porta nem caminho. `null` = inválido.
 */
export function normalizeAccessHost(value: string): string | null {
    const raw = value.trim().toLowerCase()
    if (!raw || raw.length > 253 || /[\s/\\@?#]/.test(raw)) return null
    // IPv6 sem colchetes ("::1") vira "[::1]"; com porta (ex.: "[::1]:80") é recusado.
    const candidate = raw.includes(":") && !raw.startsWith("[") ? `[${raw}]` : raw
    if (/\]:\d*$/.test(candidate)) return null
    try {
        const url = new URL(`http://${candidate}`)
        if (url.port || url.host !== candidate) return null
        return url.hostname
    } catch {
        return null
    }
}

export function allowedHostnames(appOrigin: string, extraHosts: readonly string[]): Set<string> {
    const hosts = new Set(extraHosts.map((host) => normalizeAccessHost(host)).filter((host): host is string => !!host))
    try {
        hosts.add(new URL(appOrigin).hostname.toLowerCase())
    } catch {
        /* APP_ORIGIN inválido: só a lista */
    }
    return hosts
}

export function resolveRequestOrigin(input: { headers: Headers; url: string; appOrigin: string; extraHosts: readonly string[] }): ResolvedRequestOrigin {
    const protocol = requestProtocol(input.headers, input.url)
    const host = requestHost(input.headers, input.url)
    const hostname = host ? hostnameOf(host) : null
    if (host && hostname && allowedHostnames(input.appOrigin, input.extraHosts).has(hostname)) {
        try {
            return { protocol, host, origin: new URL(`${protocol}://${host}`).origin, allowed: true }
        } catch {
            /* cai no canônico */
        }
    }
    const canonical = new URL(input.appOrigin)
    return { protocol: canonical.protocol === "https:" ? "https" : "http", host: canonical.host, origin: canonical.origin, allowed: false }
}
