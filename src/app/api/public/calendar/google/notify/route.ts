import { NextResponse } from "next/server"
import { withRoute } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { handleGoogleNotification } from "@/features/calendar/server/google/channel"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/public/calendar/google/notify — notificação push do Google Agenda, SEM sessão: validada
 * pelo canal e pelo token dele (hash, tempo constante). Só agenda a sincronização; o conteúdo vem da
 * API do Google.
 */
export const POST = withRoute(async ({ req }) => {
    await dbConnect()
    await handleGoogleNotification(req.headers)
    return new NextResponse(null, { status: 200, headers: { "Cache-Control": "no-store" } })
})
