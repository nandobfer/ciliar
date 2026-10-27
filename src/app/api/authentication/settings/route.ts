import { NextResponse } from "next/server"
import { currentAccess } from "@/features/access/server/context"
import { protectRoute } from "@/features/access/server/protect-route"
import { getAuthSettings, updateAuthSettings } from "@/features/authentication/server/settings"

/** GET /api/authentication/settings — métodos por protocolo, endereços adicionais e como a requisição atual é vista. */
export const GET = protectRoute(async (request) => NextResponse.json({ success: true, data: await getAuthSettings(currentAccess(), { headers: request.headers, url: request.url }) }))

/** PUT /api/authentication/settings — salva com versão otimista (409 em conflito, sem sobrescrever). */
export const PUT = protectRoute(async (request) =>
    NextResponse.json({ success: true, data: await updateAuthSettings(currentAccess(), await request.json().catch(() => null), { headers: request.headers, url: request.url }) }),
)
