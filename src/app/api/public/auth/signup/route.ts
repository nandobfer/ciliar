import { NextResponse } from "next/server"
import { dbConnect } from "@/lib/db"
import { DomainError, withRoute } from "@/lib/api/route"
import { assertMutationOrigin, requestAuthContext } from "@/features/auth/server/origin"
import { checkRateLimit } from "@/features/auth/server/rate-limit"
import { signupWithPassword } from "@/features/auth/server/password-signup"
import { clientIp } from "@/features/orders/server/link"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/public/auth/signup — cadastro público por e-mail e senha. Só quando o método
 * "E-mail e senha" está habilitado para o protocolo de acesso; depois o navegador entra pelo Auth.js.
 */
export const POST = withRoute(async ({ req }) => {
    await assertMutationOrigin(req)
    const { methods } = await requestAuthContext(req.headers, req.url)
    if (!methods.includes("password")) throw new DomainError(403, "Este método de login não está disponível neste endereço de acesso.", "AUTH_METHOD_DISABLED")
    checkRateLimit(`signup:ip:${clientIp(req) ?? "?"}`, Date.now(), 10)
    await dbConnect()
    const created = await signupWithPassword(await req.json().catch(() => null))
    return NextResponse.json({ success: true, data: { created: true, email: created.email } }, { status: 201, headers: { "Cache-Control": "no-store" } })
})
