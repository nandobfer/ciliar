/**
 * Tema do negócio a partir da cor primária da ficha (módulo PURO). Cópia de
 * `~/code/sipal/crm-marketing-campanhas/src/lib/companies/theme.ts`: gera as variáveis CSS (formato
 * HSL "H S% L%", como em `globals.css`) com o foreground escolhido por contraste WCAG (≥ 4,5:1):
 * branco ou quase-preto. Cor inválida ou sem contraste possível → cor padrão do Ciliar (`#0B57C4`).
 *
 * Como no crm, a sidebar é o degradê da primária (`--sidebar` → `--sidebar-primary`, 18% mais escura).
 * Além do crm: `--chart-1` (primeira cor dos gráficos) e o modo claro/escuro do negócio.
 */

import type { CSSProperties } from "react"
import { DEFAULT_BUSINESS_PRIMARY, type BusinessThemeMode } from "./constants"

export const NEUTRAL_PRIMARY = DEFAULT_BUSINESS_PRIMARY
const WHITE = "#FFFFFF"
const NEAR_BLACK = "#111111"
const MIN_CONTRAST = 4.5

export interface BusinessThemeColors {
    primaryColor: string
    mode?: BusinessThemeMode | null
}

function parseHex(hex: string): [number, number, number] | null {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
    if (!match) return null
    const value = parseInt(match[1]!, 16)
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export const isHexColor = (value: string | null | undefined): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())

function channel(c: number): number {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string): number {
    const rgb = parseHex(hex)
    if (!rgb) return 0
    const [r, g, b] = rgb
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string): number {
    const la = relativeLuminance(a)
    const lb = relativeLuminance(b)
    const [hi, lo] = la > lb ? [la, lb] : [lb, la]
    return (hi + 0.05) / (lo + 0.05)
}

/** Foreground legível sobre `background`, ou `null` se nem branco nem quase-preto atingem 4,5:1. */
export function readableForeground(background: string): string | null {
    const white = contrastRatio(background, WHITE)
    const black = contrastRatio(background, NEAR_BLACK)
    const best = white >= black ? WHITE : NEAR_BLACK
    return Math.max(white, black) >= MIN_CONTRAST ? best : null
}

export function hexToHslTriplet(hex: string): string {
    const rgb = parseHex(hex) ?? parseHex(NEUTRAL_PRIMARY)!
    const [r, g, b] = rgb.map((v) => v / 255) as [number, number, number]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    let h = 0
    let s = 0
    if (max !== min) {
        const d = max - min
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
        else if (max === g) h = (b - r) / d + 2
        else h = (r - g) / d + 4
        h *= 60
    }
    return `${Math.round(h)} ${Math.round(s * 1000) / 10}% ${Math.round(l * 1000) / 10}%`
}

function darken(hex: string, amount: number): string {
    const rgb = parseHex(hex) ?? parseHex(NEUTRAL_PRIMARY)!
    const out = rgb.map((v) => Math.max(0, Math.round(v * (1 - amount))))
    return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`
}

export interface ResolvedTheme {
    primary: string
    primaryForeground: string
    neutral: boolean
    mode: BusinessThemeMode
}

/** Resolve a cor primária usada (cai na padrão se inválida ou sem contraste). */
export function resolveTheme(colors: BusinessThemeColors | null | undefined): ResolvedTheme {
    const mode: BusinessThemeMode = colors?.mode === "dark" ? "dark" : "light"
    const candidate = colors?.primaryColor && parseHex(colors.primaryColor) ? colors.primaryColor : null
    const foreground = candidate ? readableForeground(candidate) : null
    if (candidate && foreground) return { primary: candidate, primaryForeground: foreground, neutral: false, mode }
    return { primary: NEUTRAL_PRIMARY, primaryForeground: WHITE, neutral: true, mode }
}

/** Variáveis CSS do tema do negócio para o `style` do contêiner do layout. */
export function businessThemeStyle(colors: BusinessThemeColors | null | undefined): CSSProperties {
    const theme = resolveTheme(colors)
    const primary = hexToHslTriplet(theme.primary)
    const fg = hexToHslTriplet(theme.primaryForeground)
    const sidebarPrimary = darken(theme.primary, 0.18)
    return {
        "--primary": primary,
        "--primary-foreground": fg,
        "--ring": primary,
        "--sidebar": primary,
        "--sidebar-foreground": fg,
        "--sidebar-primary": hexToHslTriplet(sidebarPrimary),
        "--sidebar-primary-foreground": hexToHslTriplet(readableForeground(sidebarPrimary) ?? WHITE),
        // Primeira cor dos gráficos = primária do negócio (os tokens `--chart-*` são cores completas).
        "--chart-1": `hsl(${primary})`,
    } as CSSProperties
}

/**
 * O mesmo tema como regra `:root`, para valer também no que é renderizado direto no `<body>`
 * (diálogos, popovers, tooltips, toasts), fora do contêiner do layout. Os valores saem só dos
 * trios HSL calculados aqui — nunca do texto digitado —, então não há injeção de CSS.
 * `:root, :root.dark` vence também os tokens do modo escuro (`.dark` em `globals.css`).
 */
export function businessThemeCss(colors: BusinessThemeColors | null | undefined): string {
    const vars = businessThemeStyle(colors) as Record<string, string>
    const body = Object.entries(vars)
        .filter(([name, value]) => /^--[a-z\d-]+$/.test(name) && /^(?:\d{1,3} \d{1,3}(\.\d)?% \d{1,3}(\.\d)?%|hsl\(\d{1,3} \d{1,3}(\.\d)?% \d{1,3}(\.\d)?%\))$/.test(value))
        .map(([name, value]) => `${name}: ${value};`)
        .join(" ")
    return `:root, :root.dark { ${body} }`
}
