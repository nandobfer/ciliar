"use client"

import { LANDING_FEATURES, LANDING_SECTIONS, LANDING_SECURITY, type LandingFeature } from "../content"
import { LandingSection } from "./LandingSection"
import { RevealItem, RevealList } from "./Reveal"

function FeatureCard({ feature }: { feature: LandingFeature }) {
    const Icon = feature.icon
    return (
        <RevealItem className="group h-full rounded-xl border border-border/70 bg-card/60 p-6 transition-[border-color,box-shadow] hover:border-primary/50 hover:shadow-[0_0_40px_-20px_hsl(var(--primary))]">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary transition-transform group-hover:scale-110"><Icon className="h-5 w-5" aria-hidden /></span>
            <h3 className="mt-4 font-semibold">{feature.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
        </RevealItem>
    )
}

/** Recursos do produto (M1–M5 e Agente Opex). */
export function LandingFeatures() {
    return (
        <LandingSection
            id={LANDING_SECTIONS.features}
            eyebrow="Recursos"
            title="Tudo o que um prestador de serviço precisa"
            description="Negócios, clientes, pedidos, trabalhos e horas conectados, com metas que se atualizam sozinhas."
            className="bg-card/20"
        >
            <RevealList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {LANDING_FEATURES.map((feature) => <FeatureCard key={feature.title} feature={feature} />)}
            </RevealList>
        </LandingSection>
    )
}

/** Segurança e privacidade: somente o que está implementado (M0/M1). */
export function LandingSecurity() {
    return (
        <LandingSection
            id={LANDING_SECTIONS.security}
            eyebrow="Segurança"
            title="Seu negócio protegido"
            description="Acesso simples e seguro, com seus dados isolados e regras claras de privacidade."
        >
            <RevealList className="grid gap-4 md:grid-cols-3">
                {LANDING_SECURITY.map((feature) => <FeatureCard key={feature.title} feature={feature} />)}
            </RevealList>
        </LandingSection>
    )
}
