"use client"

import { useEffect } from "react"
import { useReducedMotion } from "framer-motion"
import { applyDocumentMode } from "@/lib/ui/document-theme"
import { LandingFeatures, LandingSecurity } from "./LandingFeatures"
import { LandingFinalCta } from "./LandingFinalCta"
import { LandingFooter } from "./LandingFooter"
import { LandingHeader } from "./LandingHeader"
import { LandingHero } from "./LandingHero"
import { LandingPlans } from "./LandingPlans"
import { LandingSteps } from "./LandingSteps"

/**
 * Landing pública do Ciliar (`/`), fora do shell e separada do login. O CTA depende só de haver
 * sessão: visitante vai ao login ("Testar grátis"); quem está logado, ao painel.
 */
export function LandingPage({ authenticated }: { authenticated: boolean }) {
    const reduced = useReducedMotion()
    // Landing no modo claro do app (o login, escuro, troca o documento sozinho ao montar).
    useEffect(() => applyDocumentMode("light"), [])
    // Rolagem suave das âncoras só aqui (e sem movimento reduzido); o resto do app não muda.
    useEffect(() => {
        if (reduced) return
        const root = document.documentElement
        const previous = root.style.scrollBehavior
        root.style.scrollBehavior = "smooth"
        return () => { root.style.scrollBehavior = previous }
    }, [reduced])
    return (
        <div className="min-h-screen bg-background">
            <LandingHeader authenticated={authenticated} />
            <main>
                <LandingHero authenticated={authenticated} />
                <LandingSteps />
                <LandingFeatures />
                <LandingSecurity />
                <LandingPlans />
                <LandingFinalCta authenticated={authenticated} />
            </main>
            <LandingFooter authenticated={authenticated} />
        </div>
    )
}
