import { NextResponse } from "next/server"
import { currentAccess } from "@/features/access/server/context"
import { accessModels } from "@/features/access/server/models"
import { protectRoute } from "@/features/access/server/protect-route"

export const GET = protectRoute(async () => {
    const context = currentAccess()
    const user = await accessModels().users.findById(context.userId).orFail()
    return NextResponse.json({ success: true, data: { user: { id: user.id, name: user.name, email: user.email, mustChangePassword: user.mustChangePassword }, access: context.dto } })
})
