import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Reveal } from "./Reveal"

/** Seção com âncora (`id`), título `h2` e subtítulo, que aparece ao rolar. */
export function LandingSection({ id, eyebrow, title, description, badge, className, children }: {
    id: string
    eyebrow?: string
    title: string
    description?: string
    badge?: ReactNode
    className?: string
    children: ReactNode
}) {
    return (
        <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28", className)}>
            <div className="mx-auto w-full max-w-6xl">
                <Reveal className="mx-auto flex max-w-2xl flex-col items-center text-center">
                    {eyebrow && <p className="text-sm font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>}
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                        <h2 id={`${id}-title`} className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
                        {badge}
                    </div>
                    {description && <p className="mt-4 text-base text-muted-foreground text-pretty sm:text-lg">{description}</p>}
                </Reveal>
                <div className="mt-14">{children}</div>
            </div>
        </section>
    )
}
