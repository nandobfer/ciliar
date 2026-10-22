"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Copy, ExternalLink, Globe, GlobeLock, Loader2, Palette } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { businessSpaceHref } from "@/features/businesses/constants"
import { PORTFOLIO_SLUG_MAX } from "../../constants"
import { slugify } from "../../logic"
import { checkPortfolioSlug, usePortfolioAction } from "../../hooks/usePortfolio"
import type { PortfolioDto } from "../../types"
import { usePortfolioEditor } from "./context"

/** Aba "Página": publicação da página, endereço, indexação, contato exibido e tema (da Ficha). */
export function PagePanel() {
    const { portfolio } = usePortfolioEditor()
    const action = usePortfolioAction(portfolio.businessId)
    const [confirm, setConfirm] = useState<"publish" | "unpublish" | null>(null)
    const canPublish = portfolio.canPublish
    const neverPublished = portfolio.live.number === 0

    const copy = async () => {
        if (!portfolio.url) return
        try {
            await navigator.clipboard.writeText(portfolio.url)
            toast.success("Endereço copiado")
        } catch {
            toast.error("Não foi possível copiar o endereço")
        }
    }

    return (
        <div className="space-y-5 text-sm">
            {portfolio.businessStatus === "archived" && (
                <p role="status" className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Negócio arquivado: a página pública responde &quot;não encontrada&quot;. Ao restaurar, volta como estava.
                </p>
            )}
            <section className="space-y-2">
                <h3 className="flex items-center gap-2 font-semibold">
                    {portfolio.published ? <Globe className="h-4 w-4 text-primary" aria-hidden /> : <GlobeLock className="h-4 w-4 text-muted-foreground" aria-hidden />}
                    {portfolio.published ? "Página publicada" : "Página não publicada"}
                </h3>
                <p className="text-xs text-muted-foreground">{portfolio.published ? "Qualquer pessoa com o endereço vê a versão publicada, sem login." : "Desligada, o endereço responde \"não encontrada\"."}</p>
                {portfolio.live.number > 0 && <p className="text-xs text-muted-foreground">Versão publicada nº {portfolio.live.number}{portfolio.hasChanges ? " · há alterações no rascunho" : ""}.</p>}
                {canPublish && (
                    <Button type="button" size="sm" variant={portfolio.published ? "outline" : "default"} disabled={action.isPending || (!portfolio.published && neverPublished)} title={!portfolio.published && neverPublished ? "Use \"Publicar página\" na barra de cima" : undefined} onClick={() => setConfirm(portfolio.published ? "unpublish" : "publish")}>
                        {portfolio.published ? "Despublicar página" : "Ligar página"}
                    </Button>
                )}
                {!portfolio.published && neverPublished && canPublish && <p className="text-xs text-muted-foreground">Ainda não há versão publicada: use &quot;Publicar página&quot; na barra de cima.</p>}
                {portfolio.url && (
                    <div className="space-y-1 rounded-md border bg-muted/30 p-2">
                        <p className="break-all font-mono text-xs">{portfolio.url}</p>
                        <div className="flex gap-1">
                            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => void copy()}>
                                <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar
                            </Button>
                            {portfolio.published && portfolio.businessStatus === "active" && (
                                <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
                                    <a href={portfolio.url} target="_blank" rel="noreferrer noopener">
                                        <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Abrir
                                    </a>
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </section>

            <SlugField key={portfolio.slug ?? ""} portfolio={portfolio} />

            <section className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                    <label htmlFor="portfolio-indexable" className="font-semibold">
                        Indexação no Google
                    </label>
                    <Switch id="portfolio-indexable" checked={portfolio.indexable} disabled={!canPublish || action.isPending} onCheckedChange={(checked) => action.mutate({ kind: "settings", indexable: checked, version: portfolio.version })} />
                </div>
                <p className="text-xs text-muted-foreground">{portfolio.indexable ? "Permitida: a página pode aparecer nas buscas." : "Desligada (padrão): a página pede aos buscadores para não aparecer (noindex)."}</p>
            </section>

            <section className="space-y-1">
                <h3 className="font-semibold">Contato exibido</h3>
                <p className="text-xs">{portfolio.business.contactEmail ?? "Sem e-mail"}</p>
                {portfolio.business.contactPhone && <p className="text-xs">{portfolio.business.contactPhone}</p>}
                {portfolio.contactEmailIsAccount && portfolio.business.contactEmail && <p className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs text-warning">Sem e-mail comercial na Ficha: o e-mail da sua conta fica público no portfólio.</p>}
                <p className="text-xs text-muted-foreground">Sem formulário: o visitante só vê o contato. Cabeçalho e contato vêm da Ficha.</p>
            </section>

            <section className="space-y-1">
                <h3 className="flex items-center gap-2 font-semibold">
                    <Palette className="h-4 w-4 text-primary" aria-hidden /> Tema
                </h3>
                <p className="flex items-center gap-2 text-xs">
                    <span className="h-4 w-4 rounded-full border" style={{ background: portfolio.business.theme.primaryColor }} aria-hidden />
                    {portfolio.business.theme.primaryColor} · modo {portfolio.business.theme.mode === "light" ? "claro" : "escuro"}
                </p>
                <Link href={businessSpaceHref(portfolio.businessId, "ficha")} className="text-xs font-medium text-primary hover:underline">
                    Alterar na Ficha do negócio
                </Link>
            </section>

            <ConfirmDialog
                open={confirm !== null}
                onOpenChange={(open) => !open && setConfirm(null)}
                title={confirm === "publish" ? "Ligar a página?" : "Despublicar a página?"}
                description={confirm === "publish" ? "A versão publicada fica pública, sem login." : "A página pública passa a responder \"não encontrada\". Os blocos, o rascunho e o endereço ficam guardados."}
                confirmLabel={confirm === "publish" ? "Ligar página" : "Despublicar"}
                variant={confirm === "unpublish" ? "destructive" : "default"}
                pending={action.isPending}
                onConfirm={() => {
                    if (!confirm) return
                    action.mutate({ kind: confirm, version: portfolio.version }, { onSettled: () => setConfirm(null) })
                }}
            />
        </div>
    )
}

function SlugField({ portfolio }: { portfolio: PortfolioDto }) {
    const action = usePortfolioAction(portfolio.businessId)
    const [slug, setSlug] = useState(portfolio.slug ?? "")
    const [check, setCheck] = useState<{ slug: string; message: string | null; ok: boolean } | null>(null)
    const [confirm, setConfirm] = useState(false)
    const [understood, setUnderstood] = useState(false)
    const changed = slug !== (portfolio.slug ?? "")

    // Confere o endereço digitado (formato, reservados e disponibilidade), com atraso.
    useEffect(() => {
        if (!changed || !slug) return
        const timer = setTimeout(() => {
            checkPortfolioSlug(portfolio.businessId, slug).then(
                (result) => setCheck({ slug, ok: result.valid && result.available, message: result.message }),
                () => setCheck(null),
            )
        }, 350)
        return () => clearTimeout(timer)
    }, [portfolio.businessId, slug, changed])

    const status = changed && check?.slug === slug ? check : null

    return (
        <section className="space-y-1.5">
            <label htmlFor="portfolio-slug" className="font-semibold">
                Endereço
            </label>
            <form
                className="space-y-1.5"
                noValidate
                onSubmit={(event) => {
                    event.preventDefault()
                    if (!changed || !status?.ok) return
                    setUnderstood(false)
                    setConfirm(true)
                }}
            >
                <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">/p/</span>
                    <Input id="portfolio-slug" className="h-8 font-mono text-xs" value={slug} maxLength={PORTFOLIO_SLUG_MAX} disabled={!portfolio.canPublish || action.isPending} autoComplete="off" onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/\s+/g, "-"))} />
                </div>
                {portfolio.canPublish && (
                    <div className="flex flex-wrap gap-1">
                        {changed ? (
                            <>
                                <Button type="submit" size="sm" className="h-7 text-xs" disabled={!status?.ok || action.isPending}>
                                    {action.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />}
                                    Trocar endereço
                                </Button>
                                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSlug(portfolio.slug ?? "")}>
                                    Descartar
                                </Button>
                            </>
                        ) : (
                            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setSlug(slugify(portfolio.business.name))}>
                                Sugerir pelo nome
                            </Button>
                        )}
                    </div>
                )}
            </form>
            {changed && status && (
                <p role="status" className={status.ok ? "text-xs text-success" : "text-xs text-destructive"}>
                    {status.ok ? "Endereço disponível." : status.message}
                </p>
            )}
            <p className="text-xs text-muted-foreground">Único na plataforma. Trocar quebra o endereço antigo (sem redirecionamento).</p>
            <ConfirmDialog
                open={confirm}
                onOpenChange={(open) => !open && setConfirm(false)}
                title="Trocar o endereço do portfólio?"
                description={`O endereço antigo (/p/${portfolio.slug}) deixa de funcionar na hora, sem redirecionamento: links já compartilhados param de abrir.`}
                confirmLabel="Trocar endereço"
                variant="destructive"
                pending={action.isPending}
                onConfirm={() => {
                    if (!understood) return
                    action.mutate({ kind: "slug", slug, version: portfolio.version }, { onSettled: () => setConfirm(false) })
                }}
            >
                <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={understood} onCheckedChange={(value) => setUnderstood(value === true)} />
                    Entendo que o endereço antigo deixa de funcionar
                </label>
            </ConfirmDialog>
        </section>
    )
}
