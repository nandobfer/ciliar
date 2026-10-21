"use client"

import { useSyncExternalStore } from "react"
import type { BusinessThemeMode } from "../../constants"

/** Pré-visualização ao vivo do tema durante a edição da ficha (some ao salvar, descartar ou sair). */

export interface ThemePreview {
    businessId: string
    theme: { primaryColor: string; mode: BusinessThemeMode }
}

let current: ThemePreview | null = null
const listeners = new Set<() => void>()

export function setThemePreview(next: ThemePreview | null): void {
    if (current === next || (current && next && current.businessId === next.businessId && current.theme.primaryColor === next.theme.primaryColor && current.theme.mode === next.theme.mode)) return
    current = next
    for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export function useThemePreview(): ThemePreview | null {
    return useSyncExternalStore(subscribe, () => current, () => null)
}
