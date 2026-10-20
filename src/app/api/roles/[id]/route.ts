import { NextResponse } from "next/server"
import { currentAccess } from "@/features/access/server/context"
import { roleRows } from "@/features/access/server/access"
import { deleteRole, parseInput, updateRole } from "@/features/access/server/commands"
import { objectId, versionSchema } from "@/features/access/schemas"
import { accessModels } from "@/features/access/server/models"
import { protectRoute } from "@/features/access/server/protect-route"
import { DomainError } from "@/lib/api/route"
import { can } from "@/features/access/catalog"

type Params = { params: Promise<{ id: string }> }
export const GET = protectRoute(async (_request, { params }: Params) => {
    const id = parseInput(objectId, (await params).id)
    const role = (await roleRows()).find(row => row.id === id)
    if (!role) throw new DomainError(404, "Perfil não encontrado")
    const audit = await accessModels().audits.find({ targetId: id }).sort({ createdAt: -1 }).limit(50).lean()
    const members = can(currentAccess().effective, "users.view") ? await accessModels().users.find({ roles: id }).select("name") : []
    return NextResponse.json({ success: true, data: { ...role, membros: members.map(user => user.id), membrosNomes: members.map(user => ({ id: user.id, nome: user.name })), audit: audit.map(row => ({ id: String(row._id), action: row.action, actorId: row.actorId, createdAt: row.createdAt.toISOString(), simulation: row.simulation })) } })
})
export const PATCH = protectRoute(async (request, { params }: Params) => NextResponse.json({ success: true, data: await updateRole(currentAccess(), parseInput(objectId, (await params).id), await request.json().catch(() => null)) }))
export const DELETE = protectRoute(async (request, { params }: Params) => {
    const { version } = parseInput(versionSchema, await request.json().catch(() => null))
    return NextResponse.json({ success: true, data: await deleteRole(currentAccess(), parseInput(objectId, (await params).id), version) })
})
