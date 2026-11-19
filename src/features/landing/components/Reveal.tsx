"use client"

import type { ReactNode } from "react"
import { motion, useReducedMotion, type Variants } from "framer-motion"
import { DURATION } from "@/components/motion/presets"

const revealItem: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: (delay: number = 0) => ({ opacity: 1, y: 0, transition: { duration: DURATION.slow * 2, ease: "easeOut", delay } }),
}

const staggerContainer: Variants = {
    visible: { transition: { staggerChildren: 0.08 } },
}

/**
 * Aparece ao entrar na viewport (uma vez). Com movimento reduzido, renderiza já no estado final,
 * sem `initial` oculto: o conteúdo nunca depende da animação para ficar visível.
 */
export function Reveal({ children, className, delay = 0, as = "div" }: { children: ReactNode; className?: string; delay?: number; as?: "div" | "li" }) {
    const reduced = useReducedMotion()
    const Tag = as === "li" ? motion.li : motion.div
    if (reduced) return <Tag className={className}>{children}</Tag>
    return (
        <Tag className={className} variants={revealItem} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} custom={delay}>
            {children}
        </Tag>
    )
}

/** Lista com entrada escalonada dos filhos (`RevealItem`). */
export function RevealList({ children, className }: { children: ReactNode; className?: string }) {
    const reduced = useReducedMotion()
    if (reduced) return <ul className={className}>{children}</ul>
    return (
        <motion.ul className={className} variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }}>
            {children}
        </motion.ul>
    )
}

export function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
    const reduced = useReducedMotion()
    if (reduced) return <li className={className}>{children}</li>
    return <motion.li className={className} variants={revealItem} whileHover={{ y: -4 }} transition={{ duration: DURATION.base }}>{children}</motion.li>
}
