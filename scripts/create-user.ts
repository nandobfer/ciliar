import "dotenv/config"
import { existsSync } from "node:fs"
import { input, checkbox } from "@inquirer/prompts"
import { createConnection } from "mongoose"
import { identitySchema } from "../src/features/access/schemas"
import { accessModels } from "../src/features/access/server/models"
import { createOperatorUser, OPERATOR_ADMIN } from "../src/features/access/server/operator"
import { DomainError } from "../src/lib/api/route"
import { resolveScriptMongoUri, ScriptMongoConfigError } from "./helpers/mongodb-uri"

class OperatorInputError extends Error {}
async function main() {
    if (!process.stdin.isTTY || !process.stdout.isTTY || process.argv.length > 2) throw new OperatorInputError("Execute pnpm user:create em um terminal interativo. Não são aceitos argumentos nem dados por pipe.")
    const uri = resolveScriptMongoUri(process.env.MONGODB_URI, process.env.SCRIPT_MONGODB_HOST || "mongodb", process.env.SCRIPT_MONGODB_PORT, existsSync("/.dockerenv") || existsSync("/run/.containerenv"))
    const nome = await input({ message: "Nome:" })
    const email = await input({ message: "E-mail da conta Google:" })
    const parsed = identitySchema.safeParse({ nome, email })
    if (!parsed.success) throw new OperatorInputError(parsed.error.issues.map(issue => issue.message).join("\n"))
    const connection = createConnection(uri, { serverSelectionTimeoutMS: 5000 })
    try {
        await connection.asPromise()
        const roles = await accessModels(connection).roles.find({ ativo: true, slug: { $ne: "admin" } }).sort({ nome: 1 })
        const selected = await checkbox({ message: "Perfis:", required: true, choices: [
            { name: "Administrador — acesso total (operação privilegiada)", value: OPERATOR_ADMIN },
            ...roles.map(role => ({ name: role.nome, value: role.id as string })),
        ] })
        await createOperatorUser(connection, parsed.data, selected)
        console.info("E-mail pré-autorizado. Entre com o Google usando este e-mail (o Google precisa informá-lo como verificado).")
    } finally { await connection.close() }
}
main().catch(error => {
    const safe = error instanceof OperatorInputError || error instanceof ScriptMongoConfigError || error instanceof DomainError
    console.error(safe ? error.message : "Não foi possível cadastrar o usuário. Verifique a conexão e a configuração do MongoDB.")
    process.exitCode = 1
})
