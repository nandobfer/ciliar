import { NextResponse } from "next/server"
import { currentAccess } from "@/features/access/server/context"
import { userRows } from "@/features/access/server/access"
import { createUser } from "@/features/access/server/commands"
import { protectRoute } from "@/features/access/server/protect-route"

export const GET = protectRoute(async () => NextResponse.json({ success: true, data: await userRows(currentAccess()) }))
export const POST = protectRoute(async request => NextResponse.json({ success: true, data: await createUser(currentAccess(), await request.json().catch(() => null)) }, { status: 201 }))
