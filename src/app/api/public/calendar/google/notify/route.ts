import { NextResponse } from "next/server"
import { withRoute } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { checkRateLimit } from "@/features/auth/server/rate-limit"
import { handleGoogleNotification } from "@/features/calendar/server/google/channel"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Avisos por canal a cada 15 min (o Google agrupa as mudanças; acima disso, o cron cobre). */
const NOTIFY_LIMIT = 600

/**
 * POST /api/public/calendar/google/notify — notificação push do Google Agenda, SEM sessão: validada
 * pelo canal e pelo token dele (hash, tempo constante). Só agenda a sincronização; o conteúdo vem da
 * API do Google.
 */
export const POST = withRoute(async ({ req }) => {
    checkRateLimit(`calendar:notify:${(req.headers.get("x-goog-channel-id") ?? "?").slice(0, 100)}`, Date.now(), NOTIFY_LIMIT)
    await dbConnect()
    await handleGoogleNotification(req.headers)
    return new NextResponse(null, { status: 200, headers: { "Cache-Control": "no-store" } })
})
