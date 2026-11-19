"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LANDING_FINAL_CTA, landingCta } from "../content"
import { Reveal } from "./Reveal"

/** Chamada final, com o mesmo CTA do topo conforme a sessão. */
export function LandingFinalCta({ authenticated }: { authenticated: boolean }) {
    const cta = landingCta(authenticated)
    const Icon = LANDING_FINAL_CTA.icon
    return (
        <section aria-labelledby="landing-final-cta" className="px-4 py-20 sm:px-6 sm:py-28">
            <Reveal className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-3xl border border-primary/40 bg-card/70 px-6 py-14 text-center shadow-[0_0_100px_-30px_hsl(var(--primary))] sm:px-12">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.25),transparent_65%)]" aria-hidden />
                <div className="relative">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary"><Icon className="h-6 w-6" aria-hidden /></span>
                    <h2 id="landing-final-cta" className="mt-6 text-3xl font-bold tracking-tight text-balance sm:text-4xl">{LANDING_FINAL_CTA.title}</h2>
                    <p className="mx-auto mt-4 max-w-xl text-muted-foreground text-pretty">{LANDING_FINAL_CTA.description}</p>
                    <Button asChild size="lg" className="mt-8 gap-2">
                        <Link href={cta.href}>{cta.label}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
                    </Button>
                </div>
            </Reveal>
        </section>
    )
}
