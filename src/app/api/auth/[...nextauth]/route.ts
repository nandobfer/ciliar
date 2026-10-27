import { NextRequest } from "next/server"
import { handlers } from "@/auth"
import { DomainError } from "@/lib/api/route"
import { logger } from "@/lib/logger"
import { assertMutationOrigin, requestAuthContext } from "@/features/auth/server/origin"
import { accessErrorResponse } from "@/features/access/server/protect-route"
import { checkRateLimit } from "@/features/auth/server/rate-limit"
import { authMethodOfPath, METHOD_DISABLED_ERROR } from "@/features/auth/auth-paths"
import { loginErrorPath } from "@/features/auth/login-errors"
import { clientIp } from "@/features/orders/server/link"

/** Recusa no formato do `signIn` do `next-auth/react` (JSON com `url`) ou como redirecionamento. */
function refuse(request: NextRequest, origin: string, status: number, error: string, code: Parameters<typeof loginErrorPath>[0]) {
    const url = `${origin}${loginErrorPath(code)}&error=${error}`
    if (request.headers.get("x-auth-return-redirect") === "1") return Response.json({ url }, { status, headers: { "Cache-Control": "no-store" } })
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } })
}

async function handle(request: NextRequest) {
    try {
        const { resolved, methods } = await requestAuthContext(request.headers, request.url)
        if (!resolved.allowed) throw new DomainError(403, "Endereço de acesso não autorizado", "HOST_NOT_ALLOWED")
        const path = request.nextUrl.pathname
        if (request.method === "POST") {
            await assertMutationOrigin(request, false)
            if (!path.endsWith("/signout")) checkRateLimit("auth:global", Date.now(), 200)
        } else if (path.includes("/callback/")) {
            checkRateLimit("auth:callback", Date.now(), 200)
        }
        // Método desabilitado para o protocolo de acesso: recusado antes do Auth.js (inclusive chamadas diretas).
        const method = authMethodOfPath(path)
        if (method && !methods.includes(method)) {
            logger.warn({ action: "auth.method-disabled", method, protocol: resolved.protocol }, "Método de autenticação desabilitado para o protocolo")
            return refuse(request, resolved.origin, 403, METHOD_DISABLED_ERROR, "metodo-indisponivel")
        }
        if (method === "password" && request.method === "POST") {
            const form = await request.clone().formData().catch(() => null)
            const email = String(form?.get("identifier") ?? "").trim().toLowerCase().slice(0, 254)
            try {
                checkRateLimit(`login:ip:${clientIp(request) ?? "?"}`, Date.now(), 30)
                if (email) checkRateLimit(`login:${email}`)
            } catch {
                return refuse(request, resolved.origin, 429, "RateLimited", "muitas-tentativas")
            }
        }
        // O Auth.js recebe a origem da própria requisição (host permitido), sem `X-Forwarded-Host`:
        // cookies `Secure` só em HTTPS e o retorno do Google no mesmo endereço de acesso.
        const target = new URL(path + request.nextUrl.search, resolved.origin)
        const canonical = new NextRequest(target, request)
        canonical.headers.delete("x-forwarded-host")
        canonical.headers.set("host", target.host)
        canonical.headers.set("x-forwarded-proto", resolved.protocol)
        const result = await handlers[request.method === "POST" ? "POST" : "GET"](canonical)
        // Redirecionamentos do Auth.js (`Response.redirect`) têm headers imutáveis.
        const response = new Response(result.body, result)
        response.headers.set("Cache-Control", "no-store")
        return response
    } catch (error) { return accessErrorResponse(error) }
}
export const GET = handle
export const POST = handle
