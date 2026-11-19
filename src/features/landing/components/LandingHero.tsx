"use client"

import Link from "next/link"
import { motion, useReducedMotion, type Variants } from "framer-motion"
import { ArrowRight, ChevronDown, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoginBackdrop } from "@/features/auth/components/LoginBackdrop"
import { LANDING_HERO, LANDING_SECTIONS, landingCta } from "../content"
import { InterviewPreview } from "./InterviewPreview"

const container: Variants = { visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } } }
const item: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
}

/**
 * Topo da landing com o mesmo fundo do login (gradiente da primária + partículas). A `section`
 * tem `isolate`: as camadas do fundo (`z-0`) ficam abaixo do conteúdo (`z-10`).
 */
export function LandingHero({ authenticated }: { authenticated: boolean }) {
    const reduced = useReducedMotion()
    const cta = landingCta(authenticated)
    const motionProps = reduced ? {} : { variants: container, initial: "hidden", animate: "visible" }
    const itemProps = reduced ? {} : { variants: item }
    return (
        <section className="relative isolate overflow-hidden px-4 pb-20 pt-32 sm:px-6 sm:pt-40">
            <LoginBackdrop />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-40 bg-gradient-to-b from-transparent to-background" aria-hidden="true" />
            <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
                <motion.div className="flex flex-col items-center text-center lg:items-start lg:text-left" {...motionProps}>
                    <motion.p {...itemProps} className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                        <Sparkles className="h-3.5 w-3.5" aria-hidden />
                        {LANDING_HERO.eyebrow}
                    </motion.p>
                    <motion.h1 {...itemProps} className="mt-6 text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                        {LANDING_HERO.title}
                    </motion.h1>
                    <motion.p {...itemProps} className="mt-6 max-w-xl text-base text-muted-foreground text-pretty sm:text-lg">
                        {LANDING_HERO.subtitle}
                    </motion.p>
                    <motion.div {...itemProps} className="mt-8 flex flex-col gap-3 sm:flex-row">
                        <Button asChild size="lg" className="gap-2 shadow-[0_0_40px_-10px_hsl(var(--primary))]">
                            <Link href={cta.href}>{cta.label}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
                        </Button>
                        <Button asChild size="lg" variant="outline" className="gap-2 bg-background/60 backdrop-blur">
                            <a href={`#${LANDING_SECTIONS.steps}`}>{LANDING_HERO.secondary}<ChevronDown className="h-4 w-4" aria-hidden /></a>
                        </Button>
                    </motion.div>
                </motion.div>
                <motion.div
                    initial={reduced ? false : { opacity: 0, y: 32, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.6, ease: "easeOut", delay: 0.35 }}
                >
                    <InterviewPreview />
                </motion.div>
            </div>
        </section>
    )
}
