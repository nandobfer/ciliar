"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { motion, useReducedMotion } from "framer-motion"
import { AlertTriangle, CalendarClock, Check, Clock, ExternalLink, FileText, History, Loader2, Mail, Paperclip, Phone, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import { formatAttachmentSize } from "@/lib/attachments"
import { withBasePath } from "@/lib/base-path"
import type { ApiResponse } from "@/lib/types/api"
import { formatMoney } from "@/features/businesses/format"
import { businessThemeCss, businessThemeStyle } from "@/features/businesses/theme"
import { ORDER_DECISION_NAME_MAX, ORDER_REJECT_REASON_MAX, ORDER_VERSION_REASON_LABELS } from "../constants"
import { describeOrderChange } from "../history"
import { formatMinutes } from "../logic"
import type { PublicQuoteDto } from "../types"
import { dateKeyLabel } from "./OrderBadges"

/**
 * Página do link do orçamento (cliente, sem login), com o tema do negócio: dados do negócio e do
 * pedido, itens, total, entrega, anexos visíveis e histórico; aceite (nome obrigatório) ou recusa
 * (motivo opcional). Expirado, indisponível ou decidido: somente leitura.
 */
export function PublicQuotePage({ token, initial, error }: { token: string; initial: PublicQuoteDto | null; error: string | null }) {
    const reduceMotion = useReducedMotion()
    const [quote, setQuote] = useState(initial)
    const theme = quote?.business.theme ?? null

    // Tema do negócio no documento inteiro (inclusive o modo claro).
    useEffect(() => {
        if (!theme) return
        const html = document.documentElement
        const light = theme.mode === "light"
        html.classList.toggle("light", light)
        html.classList.toggle("dark", !light)
        html.style.colorScheme = light ? "light" : "dark"
        const style = document.createElement("style")
        style.textContent = businessThemeCss(theme)
        document.head.appendChild(style)
        return () => style.remove()
    }, [theme])

    if (!quote) {
        return (
            <Shell>
                <Card className="mx-auto max-w-lg">
                    <CardContent className="space-y-2 pt-6 text-center">
                        <AlertTriangle className="mx-auto h-8 w-8 text-warning" aria-hidden />
                        <p className="font-semibold">Orçamento indisponível</p>
                        <p className="text-sm text-muted-foreground">{error ?? "Link inválido ou revogado."}</p>
                    </CardContent>
                </Card>
            </Shell>
        )
    }

    const business = quote.business
    return (
        <Shell style={businessThemeStyle(theme)}>
            <motion.div initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mx-auto flex max-w-4xl flex-col gap-6">
                <header className="flex flex-wrap items-center gap-4">
                    {business.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- logo servida pela rota do link (sem otimização)
                        <img src={withBasePath(business.logoUrl)} alt={`Logo de ${business.name}`} className="h-14 w-14 rounded-lg border object-cover" />
                    ) : (
                        <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary text-xl font-bold text-primary-foreground">{business.name.slice(0, 1).toUpperCase()}</span>
                    )}
                    <div className="min-w-0 flex-1">
                        <p className="text-lg font-semibold">{business.name}</p>
                        {business.description && <p className="line-clamp-2 text-sm text-muted-foreground">{business.description}</p>}
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {business.contactEmail && (
                                <a href={`mailto:${business.contactEmail}`} className="inline-flex items-center gap-1 hover:text-primary">
                                    <Mail className="h-3.5 w-3.5" aria-hidden /> {business.contactEmail}
                                </a>
                            )}
                            {business.contactPhone && (
                                <span className="inline-flex items-center gap-1">
                                    <Phone className="h-3.5 w-3.5" aria-hidden /> {business.contactPhone}
                                </span>
                            )}
                            {business.links.map((link) => (
                                <a key={link} href={link} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-primary">
                                    <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {link.replace(/^https?:\/\//, "")}
                                </a>
                            ))}
                        </div>
                    </div>
                </header>

                <StateBanner quote={quote} />

                {quote.state !== "unavailable" && (
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
                        <div className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <p className="font-mono text-xs text-primary">Orçamento {quote.code}</p>
                                    <CardTitle className="text-xl">{quote.title}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="whitespace-pre-wrap text-sm">{quote.description}</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Itens</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <ul className="divide-y rounded-md border">
                                        {quote.items.map((item, index) => (
                                            <li key={`${item.activityName}-${index}`} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
                                                <span className="font-medium">{item.activityName}</span>
                                                <span className="font-mono text-xs text-muted-foreground">
                                                    {formatMinutes(item.minutes)} h × {formatMoney(item.hourlyRateCents, quote.currency)}/h = <span className="text-sm text-foreground">{formatMoney(item.subtotalCents, quote.currency)}</span>
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                    <p className="flex items-baseline justify-between text-lg font-semibold">
                                        <span>Valor total</span>
                                        <span className="font-mono">{formatMoney(quote.totalCents, quote.currency)}</span>
                                    </p>
                                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                        <CalendarClock className="h-4 w-4" aria-hidden /> Entrega: {quote.dueDate ? dateKeyLabel(quote.dueDate) : "a combinar"}
                                    </p>
                                </CardContent>
                            </Card>
                            {quote.attachments.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">Anexos</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <ul className="space-y-1.5">
                                            {quote.attachments.map((file) => (
                                                <li key={file.id}>
                                                    <a href={withBasePath(file.url)} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:border-primary/60">
                                                        <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                                        <span className="min-w-0 flex-1 truncate">{file.name}</span>
                                                        <span className="text-xs text-muted-foreground">{formatAttachmentSize(file.size)}</span>
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
                            {quote.state === "open" ? <DecisionCard token={token} onDecided={setQuote} /> : null}
                            <HistoryCard quote={quote} />
                        </aside>
                    </div>
                )}
                <p className="text-center text-xs text-muted-foreground">Este link é pessoal: não o compartilhe.</p>
            </motion.div>
        </Shell>
    )
}

function Shell({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <main style={style} className="min-h-screen bg-background px-4 py-8 text-foreground md:py-12">
            {children}
        </main>
    )
}

function StateBanner({ quote }: { quote: PublicQuoteDto }) {
    if (quote.state === "open")
        return (
            <p className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <Clock className="h-4 w-4 text-primary" aria-hidden /> Válido até {dateKeyLabel(quote.validUntil)}
            </p>
        )
    if (quote.state === "expired")
        return (
            <p role="status" className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                <AlertTriangle className="h-4 w-4" aria-hidden /> Orçamento expirado em {dateKeyLabel(quote.validUntil)}. Peça ao prestador um novo link.
            </p>
        )
    if (quote.state === "unavailable")
        return (
            <p role="status" className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-warning" aria-hidden /> Orçamento {quote.code} indisponível no momento. Fale com o prestador.
            </p>
        )
    const accepted = quote.state === "accepted"
    return (
        <div role="status" className={`rounded-md border px-3 py-2 text-sm ${accepted ? "border-success/40 bg-success/10 text-success" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
            <p className="flex items-center gap-2 font-medium">
                {accepted ? <Check className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
                Orçamento {accepted ? "aceito" : "recusado"}
                {quote.decision ? ` em ${format(new Date(quote.decision.at), "dd/MM/yyyy HH:mm")}${quote.decision.name ? ` por ${quote.decision.name}` : ""}` : ""}
            </p>
            {quote.decision?.reason && <p className="mt-1 text-xs">Motivo: {quote.decision.reason}</p>}
        </div>
    )
}

function DecisionCard({ token, onDecided }: { token: string; onDecided: (quote: PublicQuoteDto) => void }) {
    const [mode, setMode] = useState<"accept" | "reject" | null>(null)
    const [name, setName] = useState("")
    const [reason, setReason] = useState("")
    const [pending, setPending] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const submit = async () => {
        if (!mode) return
        if (mode === "accept" && name.trim().length < 2) return setError("Informe o seu nome para aceitar.")
        setPending(true)
        setError(null)
        try {
            const body = mode === "accept" ? { name: name.trim() } : { name: name.trim() || null, reason: reason.trim() || null }
            const quote = unwrapApi((await api.post<ApiResponse<PublicQuoteDto>>(`/public/orders/${token}/${mode}`, body)).data)
            onDecided(quote)
            toast.success(mode === "accept" ? "Orçamento aceito. O prestador foi avisado." : "Recusa registrada. O prestador foi avisado.")
        } catch (caught) {
            setError(apiErrorMessage(caught, "Não foi possível registrar a decisão."))
        } finally {
            setPending(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Sua decisão</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {!mode ? (
                    <div className="flex flex-col gap-2">
                        <Button className="gap-1.5" onClick={() => setMode("accept")}>
                            <Check className="h-4 w-4" aria-hidden /> Aceitar orçamento
                        </Button>
                        <Button variant="outline" className="gap-1.5" onClick={() => setMode("reject")}>
                            <X className="h-4 w-4" aria-hidden /> Recusar
                        </Button>
                    </div>
                ) : (
                    <form
                        className="space-y-3"
                        noValidate
                        onSubmit={(event) => {
                            event.preventDefault()
                            void submit()
                        }}
                    >
                        <Field id="quote-name" label={mode === "accept" ? "Seu nome (obrigatório)" : "Seu nome (opcional)"}>
                            <Input id="quote-name" autoFocus value={name} maxLength={ORDER_DECISION_NAME_MAX} disabled={pending} onChange={(event) => setName(event.target.value)} />
                        </Field>
                        {mode === "reject" && (
                            <Field id="quote-reason" label="Motivo (opcional)">
                                <Textarea id="quote-reason" rows={3} value={reason} maxLength={ORDER_REJECT_REASON_MAX} disabled={pending} onChange={(event) => setReason(event.target.value)} />
                            </Field>
                        )}
                        <p className="text-xs text-muted-foreground">Registramos a data, a hora e o IP da decisão, com a cópia desta versão do orçamento.</p>
                        {error && (
                            <p role="alert" className="text-sm text-destructive">
                                {error}
                            </p>
                        )}
                        <div className="flex gap-2">
                            <Button type="button" variant="ghost" disabled={pending} onClick={() => setMode(null)}>
                                Voltar
                            </Button>
                            <Button type="submit" variant={mode === "accept" ? "default" : "destructive"} className="flex-1 gap-1.5" disabled={pending}>
                                {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                                {mode === "accept" ? "Confirmar aceite" : "Confirmar recusa"}
                            </Button>
                        </div>
                    </form>
                )}
            </CardContent>
        </Card>
    )
}

function HistoryCard({ quote }: { quote: PublicQuoteDto }) {
    if (!quote.history.length) return null
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-base">
                    <History className="h-4 w-4" aria-hidden /> Histórico de alterações
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ol className="space-y-3 text-sm">
                    {quote.history.map((entry) => (
                        <li key={entry.number}>
                            <p className="flex items-center gap-1.5 font-medium">
                                <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Versão {entry.number} · {ORDER_VERSION_REASON_LABELS[entry.reason]}
                            </p>
                            <p className="text-xs text-muted-foreground">{format(new Date(entry.at), "dd/MM/yyyy HH:mm")}</p>
                            {entry.changes.length > 0 && (
                                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                                    {entry.changes.map((change, index) => (
                                        <li key={index}>{describeOrderChange(change, quote.currency)}</li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    ))}
                </ol>
            </CardContent>
        </Card>
    )
}
