import mongoose from "mongoose"

export const BUSINESS_THEME_LIGHT_MIGRATION = "business-theme-light-2026-10-27"
const MARKERS = "app_migrations"

/**
 * O app virou claro por padrão (22/10/2026) e o tema do negócio nasceu no tempo do app escuro: o
 * "Escuro" era só o padrão de quem nunca escolheu. Todo negócio que ficou assim passa UMA VEZ para
 * "Claro" (o marcador em `app_migrations` impede repetir e desfazer a troca manual de depois).
 * Correção de dado: não mexe em `version` nem audita como edição de alguém.
 *
 * Roda dentro de `dbConnect()`: NUNCA chame `dbConnect()` aqui (deadlock — ver base.md).
 */
export async function businessThemeLight(connection = mongoose.connection): Promise<number> {
    const markers = connection.collection<{ _id: string; at: Date; businesses: number }>(MARKERS)
    if (await markers.findOne({ _id: BUSINESS_THEME_LIGHT_MIGRATION })) return 0
    const updated = await connection.collection("businesses").updateMany({ "theme.mode": "dark" }, { $set: { "theme.mode": "light" } })
    await markers.updateOne({ _id: BUSINESS_THEME_LIGHT_MIGRATION }, { $setOnInsert: { at: new Date(), businesses: updated.modifiedCount } }, { upsert: true })
    return updated.modifiedCount
}
