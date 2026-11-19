"use client"

import { LANDING_SECTIONS, LANDING_STEPS } from "../content"
import { LandingSection } from "./LandingSection"
import { RevealItem, RevealList } from "./Reveal"

/** "Como funciona": o fluxo geral do produto (docs/README.md), em passos numerados. */
export function LandingSteps() {
    return (
        <LandingSection
            id={LANDING_SECTIONS.steps}
            eyebrow="Como funciona"
            title="Da primeira conversa ao pagamento"
            description="Uma entrevista guiada cria seu negócio. Depois, tudo flui pelo mesmo lugar."
        >
            <RevealList className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {LANDING_STEPS.map((step, index) => {
                    const Icon = step.icon
                    return (
                        <RevealItem key={step.title} className="group relative overflow-hidden rounded-xl border border-border/70 bg-card/60 p-6 transition-colors hover:border-primary/50">
                            <span className="pointer-events-none absolute -right-2 -top-4 select-none text-7xl font-black text-primary/5 transition-colors group-hover:text-primary/10" aria-hidden>
                                {index + 1}
                            </span>
                            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary"><Icon className="h-5 w-5" aria-hidden /></span>
                            <h3 className="mt-4 font-semibold">
                                <span className="sr-only">Passo {index + 1}: </span>
                                {step.title}
                            </h3>
                            <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
                        </RevealItem>
                    )
                })}
            </RevealList>
        </LandingSection>
    )
}
