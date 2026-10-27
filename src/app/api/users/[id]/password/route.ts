import { NextResponse } from "next/server"
import { currentAccess } from "@/features/access/server/context"
import { parseInput } from "@/features/access/server/commands"
import { removeUserPassword, setUserPassword } from "@/features/access/server/passwords"
import { objectId } from "@/features/access/schemas"
import { protectRoute } from "@/features/access/server/protect-route"

type Params = { params: Promise<{ id: string }> }

/** PUT /api/users/{id}/password — `{ password }`: define/redefine a senha e encerra as sessões do usuário. */
export const PUT = protectRoute(async (request, { params }: Params) => {
    const id = parseInput(objectId, (await params).id)
    return NextResponse.json({ success: true, data: await setUserPassword(currentAccess(), id, await request.json().catch(() => null)) })
})

/** DELETE /api/users/{id}/password — remove a senha (o usuário passa a entrar só com o Google). */
export const DELETE = protectRoute(async (_request, { params }: Params) => {
    const id = parseInput(objectId, (await params).id)
    return NextResponse.json({ success: true, data: await removeUserPassword(currentAccess(), id) })
})
