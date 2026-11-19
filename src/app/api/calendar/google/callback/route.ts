import { NextResponse } from "next/server"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { appOrigin } from "@/features/auth/server/origin"
import { finishGoogleConnect } from "@/features/calendar/server/google/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/calendar/google/callback — retorno do OAuth do Google Agenda. É uma navegação, sem o
 * cabeçalho do "Visualizar como" da aba: a sessão é a do ator real e o estado guarda a simulação e o
 * PKCE (o serviço confere que é o mesmo ator que iniciou). Redireciona para o calendário com
 * `?google=conectado|cancelado|erro`.
 */
export const GET = withRoute(async ({ req }) => {
    const access = currentAccess()
    const params = req.nextUrl.searchParams
    const outcome = await finishGoogleConnect({ userId: access.userId, sessionVersion: access.sessionVersion }, { state: params.get("state"), code: params.get("code"), error: params.get("error") })
    const url = new URL(outcome.returnTo, outcome.origin || appOrigin())
    url.searchParams.set("google", outcome.result === "connected" ? "conectado" : outcome.result === "cancelled" ? "cancelado" : "erro")
    if (outcome.message) url.searchParams.set("mensagem", outcome.message)
    const response = NextResponse.redirect(url)
    response.headers.set("Referrer-Policy", "no-referrer")
    return response
})
