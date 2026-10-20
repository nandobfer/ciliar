// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

afterEach(cleanup)

describe("Tabs compartilhadas", () => {
    it("destaca a aba ativa com a cor principal, como as abas das integrações", () => {
        render(<Tabs defaultValue="geral"><TabsList><TabsTrigger value="geral">Geral</TabsTrigger><TabsTrigger value="perfis">Perfis</TabsTrigger></TabsList></Tabs>)
        const geral = screen.getByRole("tab", { name: "Geral" })
        const perfis = screen.getByRole("tab", { name: "Perfis" })
        expect(geral.className).toContain("bg-primary")
        expect(geral.className).toContain("text-primary-foreground")
        expect(perfis.className).not.toContain("bg-primary")
        fireEvent.click(perfis)
        expect(perfis.className).toContain("bg-primary")
        expect(geral.className).not.toContain("bg-primary")
    })
})
