import mongoose from "mongoose"
import { accessModels } from "@/features/access/server/models"

export const GRANT_CALENDAR_PERMISSION_MIGRATION = "grant-calendar-permission-2026-10-27"
const MARKERS = "app_migrations"
const ADDED = ["calendar.view"] as const

/**
 * O Calendário (CIL-4, 27/10/2026) é um módulo novo dos Negócios: todo perfil com `businesses.use`
 * ganha UMA VEZ `calendar.view` (o marcador em `app_migrations` impede repetir e desfazer o que o
 * administrador tirar depois). O Administrador (`*`) não muda. Incrementa `version` (as sessões
 * releem o acesso) e audita cada perfil com o ator de sistema.
 *
 * Roda dentro de `dbConnect()`: NUNCA chame `dbConnect()` aqui (deadlock — ver base.md).
 */
export async function grantCalendarPermission(connection = mongoose.connection): Promise<number> {
    const markers = connection.collection<{ _id: string; at: Date; roles: number }>(MARKERS)
    if (await markers.findOne({ _id: GRANT_CALENDAR_PERMISSION_MIGRATION })) return 0
    const { roles, audits } = accessModels(connection)
    const targets = await roles.find({ permissoes: "businesses.use" }).lean()
    let changed = 0
    for (const role of targets) {
        if (role.permissoes.includes("*")) continue
        const added = ADDED.filter((key) => !role.permissoes.includes(key))
        if (!added.length) continue
        const updated = await roles.updateOne({ _id: role._id, version: role.version }, { $addToSet: { permissoes: { $each: added } }, $inc: { version: 1 }, $set: { updatedBy: "system" } })
        if (!updated.modifiedCount) continue
        changed += 1
        await audits.create({ actorId: "system", action: "role.permissions_migrated", targetId: String(role._id), before: { permissoes: role.permissoes }, after: { added, reason: GRANT_CALENDAR_PERMISSION_MIGRATION } })
    }
    await markers.updateOne({ _id: GRANT_CALENDAR_PERMISSION_MIGRATION }, { $setOnInsert: { at: new Date(), roles: changed } }, { upsert: true })
    return changed
}
