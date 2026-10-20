import type { Connection } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { accessModels } from "./models"

/**
 * Exclusivo do CLI `pnpm auth:migrate-google`. Remove os campos do login antigo (e-mail/senha):
 * idempotente, sem tocar perfis, sessões, histórico ou auditoria existentes.
 */
export async function removeLegacyPasswords(connection: Connection): Promise<{ updated: number }> {
    if (connection.name !== "ciliar" && process.env.NODE_ENV !== "test") throw new DomainError(400, "A migração deve usar o banco ciliar")
    const { users, audits } = accessModels(connection)
    const filter = { $or: [{ passwordHash: { $exists: true } }, { mustChangePassword: { $exists: true } }] }
    // Os campos saíram do schema: a atualização vai direto à coleção.
    const result = await users.collection.updateMany(filter, { $unset: { passwordHash: "", mustChangePassword: "" } })
    if (result.modifiedCount) {
        await audits.create({ actorId: "operator-cli", action: "users.legacy_passwords_removed", targetId: "users", before: null, after: { count: result.modifiedCount }, simulation: null })
    }
    return { updated: result.modifiedCount }
}
