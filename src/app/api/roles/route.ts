import { NextResponse } from "next/server"
import { roleRows } from "@/features/access/server/access"
import { currentAccess } from "@/features/access/server/context"
import { accessModels } from "@/features/access/server/models"
import { createRole } from "@/features/access/server/commands"
import { protectRoute } from "@/features/access/server/protect-route"

export const GET = protectRoute(async () => {
    const roles = await roleRows()
    const state = await accessModels().states.findById("global")
    const counts = await accessModels().users.aggregate<{ _id: string; total: number }>([{ $unwind: "$roles" }, { $group: { _id: "$roles", total: { $sum: 1 } } }])
    return NextResponse.json({ success: true, data: { roles: roles.map(role => ({ ...role, usuariosCount: counts.find(row => row._id === role.id)?.total ?? 0 })), hierarchyVersion: state?.version ?? 0 } })
})
export const POST = protectRoute(async request => NextResponse.json({ success: true, data: await createRole(currentAccess(), await request.json().catch(() => null)) }, { status: 201 }))
