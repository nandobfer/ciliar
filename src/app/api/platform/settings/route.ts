import { NextResponse } from "next/server"
import { currentAccess } from "@/features/access/server/context"
import { protectRoute } from "@/features/access/server/protect-route"
import { getPlatformSettings, updatePlatformSettings } from "@/features/platform/server/settings"

/** GET /api/platform/settings — perfil padrão, prazos de exclusão e limites de documentos. */
export const GET = protectRoute(async () => NextResponse.json({ success: true, data: await getPlatformSettings(currentAccess()) }))

/** PUT /api/platform/settings — salva com versão otimista (409 em conflito, sem sobrescrever). */
export const PUT = protectRoute(async (request) => NextResponse.json({ success: true, data: await updatePlatformSettings(currentAccess(), await request.json().catch(() => null)) }))
