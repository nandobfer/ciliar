// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { hexToHslTriplet } from "@/features/businesses/theme"

const business = (id: string, primaryColor: string, status: "active" | "archived" = "active") => ({
    id, ownerId: "u", ownerName: null, number: 1, name: `Negócio ${id.slice(0, 1)}`, type: null, subtype: null, segment: null,
    description: null, logo: null, links: [], availability: [], currency: "BRL", theme: { primaryColor, mode: "light" },
    contactEmail: null, contactPhone: null, deadlineAlertDays: 3, quoteValidityDays: 15, status,
    archivedAt: status === "archived" ? "2026-10-01T00:00:00.000Z" : null, purgeAt: null, interviewId: null, version: 1,
    createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
})
const items = [business("a".repeat(24), "#FF6600"), business("b".repeat(24), "#12AA55"), business("c".repeat(24), "nada"), business("d".repeat(24), "#7A1FA2", "archived")]
const mutation = { mutate: vi.fn(), isPending: false }

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@nandobfer/perfix/react", () => ({ usePermissions: () => ({ can: () => true }) }))
vi.mock("@/features/access/components/AccessProvider", () => ({ useAppSession: () => ({ session: { user: { id: "u" }, access: { simulation: null } } }) }))
vi.mock("@/features/businesses/hooks/useBusinesses", () => ({
    useBusinesses: () => ({ data: { items, capacity: { active: 3, limit: null, canCreate: true } }, isLoading: false, isError: false }),
    useBusinessesRealtime: () => undefined,
    useArchiveBusiness: () => mutation,
    useRestoreBusiness: () => mutation,
    useDeleteBusiness: () => mutation,
}))

import { BusinessesPage } from "@/features/businesses/components/BusinessesPage"

const primaryOf = (id: string) => screen.getByTestId(`business-card-${id}`).style.getPropertyValue("--primary")

describe("/negocios: card na cor primária do negócio", () => {
    afterEach(cleanup)

    it("cada card usa a própria cor; inválida volta ao padrão; arquivado mantém a cor esmaecido", () => {
        const { container } = render(<BusinessesPage />)
        expect(primaryOf("a".repeat(24))).toBe(hexToHslTriplet("#FF6600"))
        expect(primaryOf("b".repeat(24))).toBe(hexToHslTriplet("#12AA55"))
        expect(primaryOf("c".repeat(24))).toBe(hexToHslTriplet("#0B57C4"))
        expect(primaryOf("d".repeat(24))).toBe(hexToHslTriplet("#7A1FA2"))
        expect(screen.getByTestId(`business-card-${"d".repeat(24)}`).className).toContain("opacity-80")
        expect((container.firstElementChild as HTMLElement).style.getPropertyValue("--primary")).toBe("")
        expect(document.documentElement.style.getPropertyValue("--primary")).toBe("")
    })
})
