import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("Inter local sem download durante o build", () => {
    it("carrega o WOFF2 versionado com todos os pesos e preserva o token do tema", () => {
        const layout = readFileSync(resolve("src/app/layout.tsx"), "utf8")
        expect(layout).toContain('import localFont from "next/font/local"')
        expect(layout).not.toContain("next/font/google")
        expect(layout).toContain('src: "./fonts/inter-latin-variable.woff2"')
        expect(layout).toContain('variable: "--font-sans"')
        expect(layout).toContain('weight: "100 900"')
        expect(layout).toContain('style: "normal"')
        expect(layout).toContain('display: "swap"')
        expect(layout).toContain("inter.variable")
    })

    it("inclui um arquivo WOFF2 válido, não uma página de erro do download", () => {
        const font = readFileSync(resolve("src/app/fonts/inter-latin-variable.woff2"))
        expect(font.subarray(0, 4).toString("ascii")).toBe("wOF2")
        expect(font.readUInt32BE(8)).toBe(font.length)
        expect(font.length).toBeGreaterThan(10_000)
    })

    it("distribui a licença da Inter junto do arquivo", () => {
        const license = readFileSync(resolve("src/app/fonts/OFL.txt"), "utf8")
        expect(license).toContain("Inter")
        expect(license).toContain("SIL OPEN FONT LICENSE Version 1.1")
    })
})
