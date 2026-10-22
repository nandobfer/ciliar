import mongoose from "mongoose"
import { accessModels } from "@/features/access/server/models"
import { BUSINESS_FULL_PERMISSIONS } from "@/features/businesses/permissions"

export const EXPAND_BUSINESS_PERMISSIONS_MIGRATION = "expand-business-permissions-2026-10-22"
const MARKERS = "app_migrations"

/**
 * As permissões dos Negócios viraram um grupo por módulo (22/10/2026). Antes, `businesses.use`
 * liberava tudo; para ninguém perder acesso, todo perfil com `businesses.use` ganha UMA VEZ todas as
 * chaves novas (o marcador em `app_migrations` impede repetir e desfazer o que o administrador
 * tirar depois). O Administrador (`*`) não muda. Incrementa `version` (as sessões releem o acesso)
 * e audita cada perfil com o ator de sistema.
 *
 * Roda dentro de `dbConnect()`: NUNCA chame `dbConnect()` aqui (deadlock — ver base.md).
 */
export async function expandBusinessPermissions(connection = mongoose.connection): Promise<number> {
    const markers = connection.collection<{ _id: string; at: Date; roles: number }>(MARKERS)
    if (await markers.findOne({ _id: EXPAND_BUSINESS_PERMISSIONS_MIGRATION })) return 0
    const { roles, audits } = accessModels(connection)
    const targets = await roles.find({ permissoes: "businesses.use" }).lean()
    let changed = 0
    for (const role of targets) {
        if (role.permissoes.includes("*")) continue
        const added = BUSINESS_FULL_PERMISSIONS.filter((key) => !role.permissoes.includes(key))
        if (!added.length) continue
        const updated = await roles.updateOne({ _id: role._id, version: role.version }, { $addToSet: { permissoes: { $each: added } }, $inc: { version: 1 }, $set: { updatedBy: "system" } })
        if (!updated.modifiedCount) continue
        changed += 1
        await audits.create({ actorId: "system", action: "role.permissions_migrated", targetId: String(role._id), before: { permissoes: role.permissoes }, after: { added, reason: EXPAND_BUSINESS_PERMISSIONS_MIGRATION } })
    }
    await markers.updateOne({ _id: EXPAND_BUSINESS_PERMISSIONS_MIGRATION }, { $setOnInsert: { at: new Date(), roles: changed } }, { upsert: true })
    return changed
}
