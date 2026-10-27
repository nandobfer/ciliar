import { NextResponse } from "next/server"
import { currentAccess } from "@/features/access/server/context"
import { changeOwnPassword } from "@/features/access/server/passwords"
import { protectRoute } from "@/features/access/server/protect-route"

/** POST /api/me/password — `{ currentPassword?, newPassword }`: troca (ou cria) a própria senha e encerra as sessões. */
export const POST = protectRoute(async (request) => NextResponse.json({ success: true, data: await changeOwnPassword(currentAccess(), await request.json().catch(() => null)) }))
