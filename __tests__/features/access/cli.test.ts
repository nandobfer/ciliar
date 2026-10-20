import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { resolveScriptMongoUri } from "../../../scripts/helpers/mongodb-uri"

describe("CLI de cadastro", () => {
    it("recusa execução por pipe antes de conectar, sem mostrar senha ou URI", () => {
        const result = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), "scripts/create-user.ts"], { cwd: process.cwd(), env: { ...process.env, MONGODB_URI: "mongodb://operador:segredo-sentinela@host.invalid/ciliar" }, input: "senha-no-pipe", encoding: "utf8", timeout: 15_000 })
        expect(result.status).toBe(1)
        expect(result.stderr).toContain("terminal interativo")
        expect(result.stderr).not.toContain("segredo-sentinela")
        expect(result.stderr).not.toContain("senha-no-pipe")
        expect(result.stdout).not.toContain("mongodb://")
    })
    it("preserva o hostname interno quando executado no container", () => {
        const uri = "mongodb://mongodb:27017/ciliar?directConnection=true"
        expect(resolveScriptMongoUri(uri, "mongodb", "27018", true)).toBe(uri)
    })
})
