import { NextResponse } from "next/server"
import { currentAccess } from "@/features/access/server/context"
import { deleteUser, parseInput, updateUser } from "@/features/access/server/commands"
import { objectId, versionSchema } from "@/features/access/schemas"
import { protectRoute } from "@/features/access/server/protect-route"

type Params = { params: Promise<{ id: string }> }
export const PATCH = protectRoute(async (request, { params }: Params) => {
    const id = parseInput(objectId, (await params).id)
    return NextResponse.json({ success: true, data: await updateUser(currentAccess(), id, await request.json().catch(() => null)) })
})
export const DELETE = protectRoute(async (request, { params }: Params) => {
    const id = parseInput(objectId, (await params).id)
    const { version } = parseInput(versionSchema, await request.json().catch(() => null))
    return NextResponse.json({ success: true, data: await deleteUser(currentAccess(), id, version) })
})
