import { NextResponse } from "next/server"
import { currentAccess } from "@/features/access/server/context"
import { protectRoute } from "@/features/access/server/protect-route"
import { acceptLegal } from "@/features/platform/server/legal"

/** POST /api/me/legal/accept — `{ version }`: aceita somente a versão vigente (registra data/hora e versão). */
export const POST = protectRoute(async (request) => NextResponse.json({ success: true, data: await acceptLegal(currentAccess(), await request.json().catch(() => null)) }))
