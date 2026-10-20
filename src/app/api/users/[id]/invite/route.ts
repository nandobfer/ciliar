import { NextResponse } from "next/server"
import { currentAccess } from "@/features/access/server/context"
import { parseInput, resendInvite } from "@/features/access/server/commands"
import { objectId } from "@/features/access/schemas"
import { protectRoute } from "@/features/access/server/protect-route"

type Params = { params: Promise<{ id: string }> }

/** POST /api/users/{id}/invite — reenvia o convite de quem ainda não entrou com o Google. */
export const POST = protectRoute(async (_request, { params }: Params) => {
    const id = parseInput(objectId, (await params).id)
    return NextResponse.json({ success: true, data: await resendInvite(currentAccess(), id) })
})
