import { NextResponse } from "next/server"
import { currentAccess } from "@/features/access/server/context"
import { assignableRoles, denied } from "@/features/access/server/access"
import { can } from "@/features/access/catalog"
import { protectRoute } from "@/features/access/server/protect-route"

export const GET = protectRoute(async () => {
    const context = currentAccess()
    if (!can(context.effective, "users.create") && !can(context.effective, "users.edit")) throw denied()
    return NextResponse.json({ success: true, data: await assignableRoles(context) })
})
