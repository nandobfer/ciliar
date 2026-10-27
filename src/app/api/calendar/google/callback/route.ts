import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"
import { dbConnect } from "@/lib/db"
import { logger } from "@/lib/logger"
import { appOrigin } from "@/features/auth/server/origin"
import { finishGoogleConnect } from "@/features/calendar/server/google/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/calendar/google/callback — retorno do OAuth do Google Agenda (navegação, sem o cabeçalho
 * da aba). Exige a sessão do mesmo ator real que iniciou; o estado guarda a simulação e o PKCE.
 * Sempre redireciona para o calendário com `?google=conectado|cancelado|erro`.
 */
export async function GET(request: NextRequest) {
    const origin = appOrigin()
    const back = (path: string, result: string, message?: string) => {
        const url = new URL(path, origin)
        url.searchParams.set("google", result)
        if (message) url.searchParams.set("mensagem", message)
        const response = NextResponse.redirect(url)
        response.headers.set("Cache-Control", "no-store")
        response.headers.set("Referrer-Policy", "no-referrer")
        return response
    }
    try {
        const session = await auth()
        if (!session?.user?.id) return NextResponse.redirect(new URL("/login", origin))
        await dbConnect()
        const params = request.nextUrl.searchParams
        const outcome = await finishGoogleConnect(
            { userId: session.user.id, sessionVersion: (session.user as { sessionVersion?: number }).sessionVersion ?? 0 },
            { state: params.get("state"), code: params.get("code"), error: params.get("error") },
        )
        return back(outcome.returnTo, outcome.result === "connected" ? "conectado" : outcome.result === "cancelled" ? "cancelado" : "erro", outcome.message)
    } catch (error) {
        logger.error({ err: error, module: "calendar.google" }, "Falha no retorno do Google Agenda")
        return back("/calendario", "erro", "Não foi possível conectar o Google Agenda.")
    }
}
