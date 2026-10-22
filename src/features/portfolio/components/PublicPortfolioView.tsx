"use client"

import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { businessThemeCss, businessThemeStyle } from "@/features/businesses/theme"
import { referencedFiles } from "../resolve"
import type { PublicPortfolioDto, PublicPortfolioFileDto } from "../types"
import { BlocksView, PortfolioContactView, PortfolioHeaderView, type OpenFile } from "./BlocksView"

/**
 * Página pública do portfólio (M5), com o tema do negócio: cabeçalho fixo, os blocos publicados e o
 * contato no fim (sem formulário). Usada em `/p/[slug]` e na pré-visualização do rascunho. Arquivos
 * por URL assinada de curta duração: vencida, `refresh` relê o portfólio antes de abrir/baixar.
 */

/** Tema do negócio no documento inteiro (inclusive o modo claro), como no link do orçamento. */
export function useDocumentBusinessTheme(theme: PublicPortfolioDto["business"]["theme"] | null) {
    useEffect(() => {
        if (!theme) return
        const html = document.documentElement
        const light = theme.mode === "light"
        html.classList.toggle("light", light)
        html.classList.toggle("dark", !light)
        html.style.colorScheme = light ? "light" : "dark"
        const style = document.createElement("style")
        style.textContent = businessThemeCss(theme)
        document.head.appendChild(style)
        return () => style.remove()
    }, [theme])
}

const findFile = (data: PublicPortfolioDto, id: string): PublicPortfolioFileDto | null => referencedFiles(data.blocks).find((file) => file.id === id) ?? null

/** Mantém as URLs assinadas válidas: relê ao voltar para a aba depois do vencimento e antes de abrir um arquivo vencido. */
export function useFreshPortfolio(initial: PublicPortfolioDto, refresh: () => Promise<PublicPortfolioDto | null>) {
    // A versão relida vale enquanto a inicial for a mesma (uma inicial nova a substitui).
    const [fresh, setFresh] = useState<{ from: PublicPortfolioDto; data: PublicPortfolioDto } | null>(null)
    const data = fresh && fresh.from === initial ? fresh.data : initial
    const expired = useCallback(() => Date.now() >= Date.parse(data.urlsExpireAt), [data.urlsExpireAt])
    const reload = useCallback(async () => {
        const next = await refresh().catch(() => null)
        if (next) setFresh({ from: initial, data: next })
        return next
    }, [refresh, initial])
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === "visible" && expired()) void reload()
        }
        document.addEventListener("visibilitychange", onVisible)
        return () => document.removeEventListener("visibilitychange", onVisible)
    }, [expired, reload])
    const open = useCallback(
        async (event: MouseEvent<HTMLAnchorElement>, fileId: string, mode: "view" | "download") => {
            if (!expired()) return
            event.preventDefault()
            // Abre a aba no clique (sem bloqueio de pop-up) e só depois aponta para a URL nova.
            const tab = window.open("", "_blank")
            if (tab) tab.opener = null
            const next = await reload()
            const file = next ? findFile(next, fileId) : null
            const url = file ? (mode === "view" ? (file.viewUrl ?? file.downloadUrl) : file.downloadUrl) : null
            if (tab && url) tab.location.href = url
            else if (url) window.open(url, "_blank", "noopener")
            else tab?.close()
        },
        [expired, reload],
    )
    return { data, open }
}

export function PublicPortfolioView({ data, onOpenFile, banner }: { data: PublicPortfolioDto; onOpenFile: OpenFile; banner?: ReactNode }) {
    const reduceMotion = useReducedMotion()
    const business = data.business
    return (
        <main style={businessThemeStyle(business.theme)} className="min-h-screen bg-background px-4 py-8 text-foreground md:py-12">
            <motion.div initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="@container mx-auto flex max-w-5xl flex-col gap-8">
                {banner}
                <PortfolioHeaderView business={business} />
                <BlocksView blocks={data.blocks} onOpenFile={onOpenFile} />
                <PortfolioContactView business={business} />
                <p className="text-center text-xs text-muted-foreground">Portfólio de {business.name}</p>
            </motion.div>
        </main>
    )
}
