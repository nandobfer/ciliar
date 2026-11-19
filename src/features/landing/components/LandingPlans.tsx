"use client"

import { Construction } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { LANDING_PLANS, LANDING_SECTIONS } from "../content"
import { LandingSection } from "./LandingSection"
import { RevealItem, RevealList } from "./Reveal"

/** Placeholder de Planos: ainda não existem planos nem preços; cards esmaecidos e ilustrativos. */
export function LandingPlans() {
    return (
        <LandingSection
            id={LANDING_SECTIONS.plans}
            eyebrow="Planos"
            title={LANDING_PLANS.title}
            description={LANDING_PLANS.description}
            badge={<Badge variant="outline" className="gap-1 border-warning/40 bg-warning/10 text-warning"><Construction className="h-3 w-3" aria-hidden />{LANDING_PLANS.badge}</Badge>}
            className="bg-card/20"
        >
            <RevealList className="grid gap-4 md:grid-cols-3">
                {LANDING_PLANS.placeholders.map((name, index) => (
                    <RevealItem
                        key={name}
                        className={index === 1
                            ? "relative rounded-xl border border-dashed border-primary/50 bg-card/50 p-6 opacity-80"
                            : "relative rounded-xl border border-dashed border-border bg-card/40 p-6 opacity-60"}
                    >
                        <div aria-label={`Plano ${name} (em desenvolvimento)`}>
                            <h3 className="font-semibold">{name}</h3>
                            <p className="mt-1 text-sm text-muted-foreground">Em breve</p>
                            <div className="mt-6 space-y-2" aria-hidden>
                                <div className="h-8 w-24 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
                                <div className="h-3 w-full rounded bg-muted/70" />
                                <div className="h-3 w-5/6 rounded bg-muted/70" />
                                <div className="h-3 w-4/6 rounded bg-muted/70" />
                                <div className="h-3 w-3/4 rounded bg-muted/70" />
                            </div>
                            <div className="mt-6 h-9 w-full rounded-md border border-dashed border-border" aria-hidden />
                        </div>
                    </RevealItem>
                ))}
            </RevealList>
        </LandingSection>
    )
}
