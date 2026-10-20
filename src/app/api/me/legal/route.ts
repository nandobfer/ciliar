import { NextResponse } from "next/server"
import { currentAccess } from "@/features/access/server/context"
import { protectRoute } from "@/features/access/server/protect-route"
import { getMyLegal } from "@/features/platform/server/legal"

/** GET /api/me/legal — versão vigente dos termos/política e o aceite do usuário real. */
export const GET = protectRoute(async () => NextResponse.json({ success: true, data: await getMyLegal(currentAccess().userId) }))
