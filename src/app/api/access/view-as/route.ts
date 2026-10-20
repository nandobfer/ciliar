import { NextResponse } from "next/server"
import { z } from "zod"
import { currentAccess } from "@/features/access/server/context"
import { accessModels } from "@/features/access/server/models"
import { auditAccess, denied, roleRows, resolveAccess } from "@/features/access/server/access"
import { encodeViewAs } from "@nandobfer/perfix"
import { parseInput } from "@/features/access/server/commands"
import { viewAsSchema } from "@/features/access/schemas"
import { protectRoute } from "@/features/access/server/protect-route"

export const GET = protectRoute(async request => {
    const context = currentAccess()
    if (!context.realEffective.has("*")) throw denied()
    const params = parseInput(z.strictObject({ kind: z.enum(["roles", "users"]).optional(), q: z.string().trim().max(128).optional() }), Object.fromEntries(new URL(request.url).searchParams))
    const activeRoles = (await roleRows()).filter(role => role.ativo)
    const roles = params.kind === "users" ? [] : activeRoles.map(role => ({ id: role.id, nome: role.nome, cor: role.cor, coringa: role.permissoes.includes("*") }))
    const term = params.q?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const filter = { active: true, ...(term ? { $or: [{ name: { $regex: term, $options: "i" } }, { email: { $regex: term, $options: "i" } }] } : {}) }
    const users = params.kind === "roles" ? [] : (await accessModels().users.find(filter).sort({ name: 1, _id: 1 }).limit(20).select("name email roles")).map(user => ({ id: user.id as string, nome: user.name, email: user.email,
        cargos: activeRoles.filter(role => user.roles.includes(role.id)).map(role => ({ id: role.id, nome: role.nome, cor: role.cor })),
    }))
    return NextResponse.json({ success: true, data: { roles, users } })
})
export const POST = protectRoute(async request => {
    const context = currentAccess()
    if (!context.realEffective.has("*")) throw denied()
    const data = parseInput(z.strictObject({ kind: z.enum(["inicio", "troca", "fim"]), previous: viewAsSchema.nullable(), next: viewAsSchema.nullable() }), await request.json().catch(() => null))
    if ((data.kind === "fim") !== (data.next === null) || (data.kind === "inicio") !== (data.previous === null)) throw denied("Transição de simulação inválida")
    const next = data.next ? (await resolveAccess(context.userId, encodeViewAs(data.next), null, context.sessionVersion)).dto.simulation : null
    // Depois que um alvo é inativado, ainda é necessário conseguir encerrar a simulação.
    const previous = data.previous ? await resolveAccess(context.userId, encodeViewAs(data.previous), null, context.sessionVersion).then(value => value.dto.simulation).catch(() => ({ alvo: data.previous, indisponivel: true })) : null
    await auditAccess(context, `view-as.${data.kind}`, context.userId, previous, next)
    return NextResponse.json({ success: true, data: { recorded: true } })
})
