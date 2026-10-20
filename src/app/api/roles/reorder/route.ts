import { NextResponse } from "next/server"
import { currentAccess } from "@/features/access/server/context"
import { reorderRoles } from "@/features/access/server/commands"
import { protectRoute } from "@/features/access/server/protect-route"

export const POST = protectRoute(async request => NextResponse.json({ success: true, data: await reorderRoles(currentAccess(), await request.json().catch(() => null)) }))
