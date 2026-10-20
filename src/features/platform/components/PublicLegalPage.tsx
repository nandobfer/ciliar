import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Markdown } from "@/components/ui/markdown"
import type { LegalVersionDto } from "../types"

/** Página pública (sem sessão) de `/termos` e `/privacidade`: sempre a versão vigente. */
export function PublicLegalPage({ title, legal, pick }: { title: string; legal: LegalVersionDto | null; pick: "termsOfUse" | "privacyPolicy" }) {
    return (
        <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-10">
            <header className="space-y-1">
                <Link href="/login" className="text-sm text-primary underline underline-offset-2 hover:text-primary/80">Ciliar</Link>
                <h1 className="text-2xl font-semibold">{title}</h1>
                {legal && (
                    <p className="text-sm text-muted-foreground">
                        Versão {legal.version}, publicada em {format(new Date(legal.publishedAt), "dd/MM/yyyy", { locale: ptBR })}.
                    </p>
                )}
            </header>
            <article className="rounded-xl border bg-card p-6">
                {legal ? <Markdown>{legal[pick]}</Markdown> : <p className="text-sm text-muted-foreground">Documento ainda não publicado.</p>}
            </article>
            <nav className="flex gap-4 text-sm">
                <Link href="/termos" className="text-primary underline underline-offset-2 hover:text-primary/80">Termos de uso</Link>
                <Link href="/privacidade" className="text-primary underline underline-offset-2 hover:text-primary/80">Política de privacidade</Link>
            </nav>
        </main>
    )
}
