import "dotenv/config"
import { existsSync } from "node:fs"
import { confirm } from "@inquirer/prompts"
import { createConnection } from "mongoose"
import { removeLegacyPasswords } from "../src/features/access/server/migrations"
import { DomainError } from "../src/lib/api/route"
import { resolveScriptMongoUri, ScriptMongoConfigError } from "./helpers/mongodb-uri"

class OperatorInputError extends Error {}

/**
 * Migração para o login Google (M0): remove `passwordHash` e `mustChangePassword` de todos os
 * usuários. Idempotente; contas, perfis, histórico e auditoria são preservados e o vínculo com o
 * Google acontece no primeiro "Entrar com Google" com o mesmo e-mail verificado.
 */
async function main() {
    if (!process.stdin.isTTY || !process.stdout.isTTY || process.argv.length > 2) throw new OperatorInputError("Execute pnpm auth:migrate-google em um terminal interativo, sem argumentos.")
    const uri = resolveScriptMongoUri(process.env.MONGODB_URI, process.env.SCRIPT_MONGODB_HOST || "mongodb", process.env.SCRIPT_MONGODB_PORT, existsSync("/.dockerenv") || existsSync("/run/.containerenv"))
    const proceed = await confirm({ message: "Remover as senhas antigas de todos os usuários? O login passa a ser somente pelo Google.", default: false })
    if (!proceed) {
        console.info("Nada foi alterado.")
        return
    }
    const connection = createConnection(uri, { serverSelectionTimeoutMS: 5000 })
    try {
        await connection.asPromise()
        const { updated } = await removeLegacyPasswords(connection)
        console.info(updated ? `Senhas removidas de ${updated} usuário(s).` : "Nenhum usuário com senha antiga.")
    } finally { await connection.close() }
}
main().catch(error => {
    const safe = error instanceof OperatorInputError || error instanceof ScriptMongoConfigError || error instanceof DomainError
    console.error(safe ? error.message : "Não foi possível migrar os usuários. Verifique a conexão e a configuração do MongoDB.")
    process.exitCode = 1
})
