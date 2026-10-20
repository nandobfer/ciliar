// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import { InterviewProgressPanel } from "@/features/businesses/components/InterviewProgressPanel"
import type { InterviewProgressDto } from "@/features/businesses/types"

afterEach(cleanup)

const progress: InterviewProgressDto = {
    id: "a".repeat(24),
    status: "in_progress",
    scriptVersion: 3,
    subtype: "MEI",
    businessId: null,
    canDiscard: false,
    acceptsImage: false,
    startedAt: new Date().toISOString(),
    completedAt: null,
    questions: [
        { field: "name", prompt: "Nome?", required: true, active: true, status: "answered", display: "Studio Aurora", current: false },
        { field: "type", prompt: "Tipo?", required: true, active: true, status: "answered", display: "PJ — Pessoa jurídica", current: false },
        { field: "logo", prompt: "Logo?", required: false, active: true, status: "skipped", display: null, current: false },
        { field: "links", prompt: "Links?", required: false, active: true, status: "pending", display: null, current: true },
    ],
}

describe("painel de progresso da entrevista", () => {
    it("mostra cada pergunta com a situação, o valor coletado e a atual", () => {
        render(<InterviewProgressPanel progress={progress} />)
        const panel = screen.getByRole("complementary", { name: "Progresso da entrevista" })
        expect(within(panel).getByText("3 de 4 pergunta(s) · roteiro v3")).toBeTruthy()
        expect(within(panel).getByText("Studio Aurora")).toBeTruthy()
        expect(within(panel).getByText("PJ — Pessoa jurídica · MEI")).toBeTruthy()
        expect(within(panel).getByText(/Pulada: preencha depois/)).toBeTruthy()
        const current = panel.querySelector('[aria-current="step"]')
        expect(current?.textContent).toContain("Site e redes sociais")
        expect(within(panel).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("3")
    })
})
