// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

afterEach(cleanup)

describe("Tabs compartilhadas", () => {
    it("destaca a aba ativa como no crm-marketing-campanhas (fundo da página com sombra sobre o trilho)", () => {
        render(<Tabs defaultValue="geral"><TabsList><TabsTrigger value="geral">Geral</TabsTrigger><TabsTrigger value="perfis">Perfis</TabsTrigger></TabsList></Tabs>)
        const geral = screen.getByRole("tab", { name: "Geral" })
        const perfis = screen.getByRole("tab", { name: "Perfis" })
        expect(geral.className).toContain("bg-background text-foreground shadow-sm")
        expect(perfis.className).not.toContain("bg-background")
        fireEvent.click(perfis)
        expect(perfis.className).toContain("bg-background text-foreground shadow-sm")
        expect(geral.className).not.toContain("bg-background")
    })
})
