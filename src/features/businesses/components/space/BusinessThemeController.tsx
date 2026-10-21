"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { usePermissions } from "@nandobfer/perfix/react"
import { businessThemeCss } from "../../theme"
import { useBusiness } from "../../hooks/useBusinesses"
import { activeBusinessId } from "../BusinessSwitcher"
import { useThemePreview } from "./theme-preview"

const STYLE_ID = "ciliar-business-theme"

/**
 * Tema do negócio aberto (`/negocios/[id]/…`): cor primária como regra `:root` (vale também nos
 * diálogos, popovers e toasts do `<body>`) e o modo claro trocando `.dark` por `.light` no `<html>`.
 * Fora do espaço (telas globais), volta ao padrão do Ciliar (escuro, `#0B57C4`). Montado uma vez na casca.
 */
export function BusinessThemeController() {
    const pathname = usePathname()
    const { canAny } = usePermissions()
    const id = activeBusinessId(pathname)
    const query = useBusiness(id && canAny(["businesses.use", "businesses.view_all"]) ? id : null)
    const preview = useThemePreview()
    const saved = id && query.data?.id === id ? query.data.theme : null
    const theme = id ? (preview?.businessId === id ? preview.theme : saved) : null
    const primaryColor = theme?.primaryColor ?? null
    const mode = theme?.mode ?? null

    useEffect(() => {
        if (!primaryColor || !mode) return
        const html = document.documentElement
        const light = mode === "light"
        html.classList.toggle("light", light)
        html.classList.toggle("dark", !light)
        const style = document.createElement("style")
        style.id = STYLE_ID
        style.textContent = businessThemeCss({ primaryColor, mode })
        document.head.appendChild(style)
        return () => {
            style.remove()
            html.classList.remove("light")
            html.classList.add("dark")
        }
    }, [primaryColor, mode])

    return null
}
