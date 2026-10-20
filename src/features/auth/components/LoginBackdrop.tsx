"use client"

import dynamic from "next/dynamic"

// Canvas de partículas só no cliente (lê os tokens do tema do DOM): evita divergência de hidratação.
const LoginParticleBackground = dynamic(() => import("./LoginParticleBackground").then((mod) => mod.LoginParticleBackground), {
    ssr: false,
})

/**
 * Fundo da tela de login (gradiente radial da primária + partículas), compartilhado com o loading
 * do shell (`AccessLoadingScreen`). Deve ficar dentro de um `main` com `isolate`: as camadas são
 * `z-0`, abaixo do conteúdo em `z-10`.
 */
export function LoginBackdrop() {
    return (
        <>
            <div
                className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.18),transparent_60%)]"
                aria-hidden="true"
            />
            <LoginParticleBackground />
        </>
    )
}
