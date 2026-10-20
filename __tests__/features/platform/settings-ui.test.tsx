// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { DEFAULT_PLATFORM_SETTINGS, platformSettingsSchema, type PlatformSettings } from "@/features/platform/schemas"
import { SignupSection } from "@/features/platform/components/PlatformSettingsSections"
import type { DefaultRoleOption } from "@/features/platform/types"

vi.mock("framer-motion", async () => (await import("../../helpers/framer-motion")).framerMotionMock())
afterEach(cleanup)

const roleId = "6ad758a0392e6445e672a6f9"
const options: DefaultRoleOption[] = [{ id: roleId, nome: "Gratuito", cor: "verde", ativo: true, bloqueado: false }]
const saved: PlatformSettings = { ...DEFAULT_PLATFORM_SETTINGS, defaultRoleId: roleId }

/** Mesma sequência do `PlatformEditorForm`: monta com os padrões e reseta com o que veio da API. */
function Harness({ onValues }: { onValues: (values: PlatformSettings) => void }) {
    const form = useForm<PlatformSettings>({ resolver: zodResolver(platformSettingsSchema), mode: "onChange", defaultValues: DEFAULT_PLATFORM_SETTINGS })
    useEffect(() => form.reset(saved), [form])
    useEffect(() => form.subscribe({ formState: { values: true }, callback: ({ values }) => onValues(values) }), [form, onValues])
    return (
        <form>
            <SignupSection form={form} options={options} signup={{ available: true, reason: null, message: null }} readOnly={false} />
        </form>
    )
}

describe("aba Cadastro da Plataforma", () => {
    it("mostra o perfil padrão salvo, sem apagá-lo nem acusar ID inválido", async () => {
        const onValues = vi.fn()
        render(<Harness onValues={onValues} />)
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
        expect(screen.getByRole("combobox", { name: "Perfil padrão" }).textContent).toContain("Gratuito")
        expect(screen.queryByText("ID inválido")).toBeNull()
        for (const [values] of onValues.mock.calls) expect((values as PlatformSettings).defaultRoleId).not.toBe("")
        expect(screen.getByText("Cadastro público disponível.")).toBeTruthy()
    })
})
