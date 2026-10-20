"use client"

import { motion, useReducedMotion } from "framer-motion"
import { DURATION } from "@/components/motion/presets"
import { LoginBackdrop } from "@/features/auth/components/LoginBackdrop"

const DOTS = [0, 1, 2] as const

/**
 * Loading do shell enquanto a sessão é validada (`/api/me`): mesma identidade do login (gradiente,
 * partículas e marca), anel girando na primária e reticências animadas. Com movimento reduzido fica
 * estático, só com o fade de entrada.
 */
export function AccessLoadingScreen() {
    const reducedMotion = useReducedMotion()
    const pulse = { duration: 2, repeat: Infinity, repeatType: "reverse" as const, ease: "easeInOut" as const }
    return (
        <main className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4">
            <LoginBackdrop />
            <motion.div
                role="status"
                aria-live="polite"
                aria-busy="true"
                aria-label="Carregando acesso"
                initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
                animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: DURATION.slow, ease: "easeOut" }}
                className="relative z-10 flex flex-col items-center gap-6"
            >
                <div className="relative h-16 w-16 sm:h-20 sm:w-20" aria-hidden="true" data-testid="access-loading-ring">
                    <motion.div
                        className="absolute inset-0 rounded-full shadow-[0_0_50px_-18px_hsl(var(--primary))]"
                        animate={reducedMotion ? undefined : { opacity: [0.5, 1], scale: [0.95, 1.05] }}
                        transition={reducedMotion ? undefined : pulse}
                    />
                    <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                    <motion.div
                        className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary"
                        animate={reducedMotion ? undefined : { rotate: 360 }}
                        transition={reducedMotion ? undefined : { duration: 1.1, repeat: Infinity, ease: "linear" }}
                    />
                </div>
                <motion.p
                    className="text-4xl font-bold tracking-tight drop-shadow-[0_0_18px_hsl(var(--primary)/0.6)] sm:text-5xl"
                    animate={reducedMotion ? undefined : { opacity: [0.75, 1] }}
                    transition={reducedMotion ? undefined : pulse}
                >
                    Ciliar
                </motion.p>
                <p className="text-sm text-muted-foreground sm:text-base">
                    Carregando acesso
                    <span aria-hidden="true" data-testid="access-loading-dots">
                        {DOTS.map((index) => (
                            <motion.span
                                key={index}
                                animate={reducedMotion ? undefined : { opacity: [0.2, 1, 0.2] }}
                                transition={reducedMotion ? undefined : { duration: 1.2, repeat: Infinity, delay: index * 0.2 }}
                            >
                                .
                            </motion.span>
                        ))}
                    </span>
                </p>
            </motion.div>
        </main>
    )
}
