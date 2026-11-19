import Link from "next/link"

/** Rodapé público: marca, ano e links legais. */
export function LandingFooter({ authenticated }: { authenticated: boolean }) {
    return (
        <footer className="border-t border-border/60 px-4 py-10 sm:px-6">
            <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
                <p><span className="font-semibold text-foreground">Ciliar</span> · © {new Date().getFullYear()}</p>
                <nav aria-label="Rodapé" className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <Link href="/termos" className="hover:text-foreground">Termos de uso</Link>
                    <Link href="/privacidade" className="hover:text-foreground">Política de privacidade</Link>
                    {!authenticated && <Link href="/login" className="hover:text-foreground">Entrar</Link>}
                </nav>
            </div>
        </footer>
    )
}
