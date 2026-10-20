// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import React, { type ReactNode } from "react"

type MotionProps = { initial?: Record<string, unknown> | false; animate?: Record<string, unknown>; transition?: Record<string, unknown> }
const state = vi.hoisted(() => ({ reduced: false, motion: [] as MotionProps[], options: {} as { particles?: { move?: { enable?: boolean }; color?: { value?: string } } } }))
vi.mock("framer-motion", async () => {
    const base = (await import("../../helpers/framer-motion")).framerMotionMock()
    const cache: Record<string, unknown> = {}
    const capture = (tag: string) => (cache[tag] ??= function Motion(props: MotionProps & Record<string, unknown>) {
        state.motion.push({ initial: props.initial, animate: props.animate, transition: props.transition })
        const Inner = (base.motion as Record<string, React.FC<Record<string, unknown>>>)[tag]!
        return <Inner {...props} />
    })
    return { ...base, motion: new Proxy({}, { get: (_, tag: string) => capture(tag) }), useReducedMotion: () => state.reduced }
})
vi.mock("@tsparticles/react", () => ({ default: ({ options }: { options: typeof state.options }) => { state.options = options; return <div data-testid="particles" /> }, ParticlesProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock("@tsparticles/slim", () => ({ loadSlim: vi.fn() }))
import { AccessLoadingScreen } from "@/features/access/components/AccessLoadingScreen"

afterEach(cleanup)
beforeEach(() => { vi.clearAllMocks(); state.reduced = false; state.motion = []; document.documentElement.style.setProperty("--primary", "215 89% 41%") })
const continuous = () => state.motion.filter((props) => props.transition?.repeat === Infinity)

describe("loading animado da validação de acesso", () => {
    it("é um status acessível com a identidade do login e partículas no tema", async () => {
        render(<AccessLoadingScreen />)
        const status = screen.getByRole("status", { name: "Carregando acesso" })
        expect(status.getAttribute("aria-live")).toBe("polite")
        expect(status.getAttribute("aria-busy")).toBe("true")
        expect(screen.getByText("Ciliar")).toBeTruthy()
        expect(screen.queryByRole("heading")).toBeNull()
        expect(screen.getByTestId("access-loading-ring").getAttribute("aria-hidden")).toBe("true")
        expect(screen.getByTestId("access-loading-dots").getAttribute("aria-hidden")).toBe("true")
        await waitFor(() => expect(screen.getByTestId("particles")).toBeTruthy())
        expect(state.options.particles?.color?.value).toBe("hsl(215 89% 41%)")
    })
    it("anima o anel, o brilho e as reticências sem movimento reduzido", async () => {
        render(<AccessLoadingScreen />)
        expect(continuous().some((props) => props.animate?.rotate === 360)).toBe(true)
        const delays = continuous().map((props) => props.transition?.delay).filter((delay) => delay !== undefined)
        expect(delays).toEqual([0, 0.2, 0.4])
        await waitFor(() => expect(screen.getByTestId("particles")).toBeTruthy())
        expect(state.options.particles?.move?.enable).toBe(true)
    })
    it("fica estático com movimento reduzido, só com o fade de entrada", async () => {
        state.reduced = true
        render(<AccessLoadingScreen />)
        expect(continuous()).toHaveLength(0)
        expect(state.motion.some((props) => props.animate && "rotate" in props.animate)).toBe(false)
        const entry = state.motion.find((props) => props.initial)
        expect(entry?.initial).toEqual({ opacity: 0 })
        expect(entry?.animate).toEqual({ opacity: 1 })
        await waitFor(() => expect(screen.getByTestId("particles")).toBeTruthy())
        expect(state.options.particles?.move?.enable).toBe(false)
    })
})
