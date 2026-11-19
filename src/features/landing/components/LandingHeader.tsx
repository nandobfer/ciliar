"use client"

import { useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowRight, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DURATION } from "@/components/motion/presets"
import { LANDING_NAV, landingCta } from "../content"

/** Cabeçalho fixo da landing: marca, âncoras das seções e o CTA conforme a sessão. */
export function LandingHeader({ authenticated }: { authenticated: boolean }) {
    const reduced = useReducedMotion()
    const [open, setOpen] = useState(false)
    const cta = landingCta(authenticated)
    return (
        <header className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-md">
            <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
                <Link href="/" className="text-xl font-bold tracking-tight">Ciliar</Link>
                <nav aria-label="Seções" className="hidden items-center gap-6 md:flex">
                    {LANDING_NAV.map((item) => (
                        <a key={item.id} href={`#${item.id}`} className="text-sm text-muted-foreground transition-colors hover:text-foreground">{item.label}</a>
                    ))}
                </nav>
                <div className="flex items-center gap-2">
                    {!authenticated && (
                        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                            <Link href="/login">Entrar</Link>
                        </Button>
                    )}
                    <Button asChild size="sm" className="hidden gap-1 sm:inline-flex">
                        <Link href={cta.href}>{cta.label}<ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="md:hidden"
                        aria-label={open ? "Fechar menu" : "Abrir menu"}
                        aria-expanded={open}
                        aria-controls="landing-mobile-menu"
                        onClick={() => setOpen((value) => !value)}
                    >
                        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </Button>
                </div>
            </div>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.nav
                        id="landing-mobile-menu"
                        aria-label="Seções (menu)"
                        initial={reduced ? false : { opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                        transition={{ duration: DURATION.base }}
                        className="overflow-hidden border-t border-border/60 md:hidden"
                    >
                        <div className="flex flex-col gap-1 px-4 py-3">
                            {LANDING_NAV.map((item) => (
                                <a key={item.id} href={`#${item.id}`} onClick={() => setOpen(false)} className="rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">{item.label}</a>
                            ))}
                            <div className="mt-2 flex gap-2">
                                {!authenticated && (
                                    <Button asChild variant="outline" size="sm" className="flex-1"><Link href="/login">Entrar</Link></Button>
                                )}
                                <Button asChild size="sm" className="flex-1"><Link href={cta.href}>{cta.label}</Link></Button>
                            </div>
                        </div>
                    </motion.nav>
                )}
            </AnimatePresence>
        </header>
    )
}
