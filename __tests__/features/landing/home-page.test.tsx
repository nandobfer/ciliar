import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ auth: vi.fn() }))
vi.mock("@/auth", () => ({ auth: state.auth }))
vi.mock("@/features/landing/components/LandingPage", () => ({ LandingPage: () => null }))
import HomePage, { dynamic } from "@/app/page"
import { LandingPage } from "@/features/landing/components/LandingPage"

beforeEach(() => state.auth.mockReset())

describe("rota / (landing)", () => {
    it("renderiza a landing por requisição, sem redirecionar, com o estado da sessão", async () => {
        expect(dynamic).toBe("force-dynamic")
        state.auth.mockResolvedValue(null)
        const anonymous = await HomePage()
        expect(anonymous.type).toBe(LandingPage)
        expect(anonymous.props).toEqual({ authenticated: false })

        state.auth.mockResolvedValue({ user: { id: "u1", name: "Ana" } })
        expect((await HomePage()).props).toEqual({ authenticated: true })

        state.auth.mockResolvedValue({ user: {} })
        expect((await HomePage()).props).toEqual({ authenticated: false })
    })
})
