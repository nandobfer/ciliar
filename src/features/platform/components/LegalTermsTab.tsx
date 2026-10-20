"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Eye, Loader2, Send, Undo2 } from "lucide-react"
import { usePermissions } from "@nandobfer/perfix/react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Markdown } from "@/components/ui/markdown"
import { MarkdownField } from "@/components/ui/markdown-field"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ErrorState } from "@/components/feedback/ErrorState"
import { EmptyState } from "@/components/feedback/EmptyState"
import { apiErrorMessage } from "@/lib/api"
import { legalPublishSchema } from "../schemas"
import { useLegalOverview, useLegalVersion, usePublishLegal } from "../hooks/usePlatform"
import type { LegalOverviewDto } from "../types"

const formatDate = (value: string) => format(new Date(value), "dd/MM/yyyy HH:mm", { locale: ptBR })

/**
 * Aba "Termos e privacidade": cada publicação gera uma versão imutável que todos os usuários
 * precisam aceitar no próximo acesso. O rascunho parte da versão vigente.
 */
export function LegalTermsTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useLegalOverview()
    if (query.isLoading) return <Skeleton className="h-96 w-full" />
    if (query.isError || !query.data) return <ErrorState title="Não foi possível carregar os termos" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    // Nova versão publicada recria o rascunho a partir dela.
    return <LegalTermsEditor key={query.data.current?.version ?? 0} overview={query.data} onDirtyChange={onDirtyChange} />
}

function LegalTermsEditor({ overview, onDirtyChange }: { overview: LegalOverviewDto; onDirtyChange: (dirty: boolean) => void }) {
    const { can } = usePermissions()
    const editable = can("integrations.platform.edit")
    const publish = usePublishLegal()
    const current = overview.current
    const baseTerms = current?.termsOfUse ?? ""
    const basePrivacy = current?.privacyPolicy ?? ""
    const [terms, setTerms] = useState(baseTerms)
    const [privacy, setPrivacy] = useState(basePrivacy)
    const [notes, setNotes] = useState("")
    const [confirming, setConfirming] = useState(false)
    const [viewing, setViewing] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)
    const dirty = terms !== baseTerms || privacy !== basePrivacy || notes !== ""

    useEffect(() => {
        onDirtyChange(dirty)
        return () => onDirtyChange(false)
    }, [dirty, onDirtyChange])

    const requestPublish = () => {
        const parsed = legalPublishSchema.safeParse({ termsOfUse: terms, privacyPolicy: privacy, notes })
        if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? "Revise os textos")
            return
        }
        if (current && parsed.data.termsOfUse === current.termsOfUse && parsed.data.privacyPolicy === current.privacyPolicy) {
            setError("Os textos são iguais aos da versão vigente")
            return
        }
        setError(null)
        setConfirming(true)
    }
    const confirmPublish = () => {
        publish.mutate({ termsOfUse: terms, privacyPolicy: privacy, notes }, { onSettled: () => setConfirming(false) })
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Termos de uso e política de privacidade</CardTitle>
                    <CardDescription>
                        {current
                            ? `Versão vigente: ${current.version}, publicada em ${formatDate(current.publishedAt)}${current.publishedByName ? ` por ${current.publishedByName}` : ""}.`
                            : "Nenhuma versão publicada: o cadastro público fica indisponível até a primeira publicação."}{" "}
                        Textos em Markdown. Publicar gera uma nova versão e exige novo aceite de todos os usuários.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    {editable ? (
                        <>
                            <Field id="legal-terms" label="Termos de uso">
                                <MarkdownField id="legal-terms" value={terms} onChange={setTerms} rows={14} tablistLabel="Termos de uso" />
                            </Field>
                            <Field id="legal-privacy" label="Política de privacidade">
                                <MarkdownField id="legal-privacy" value={privacy} onChange={setPrivacy} rows={14} tablistLabel="Política de privacidade" />
                            </Field>
                        </>
                    ) : current ? (
                        <ReadOnlyTexts terms={current.termsOfUse} privacy={current.privacyPolicy} />
                    ) : null}
                    {editable && (
                        <Field id="legal-notes" label="Resumo das mudanças (opcional)">
                            <Input id="legal-notes" value={notes} maxLength={500} onChange={(event) => setNotes(event.target.value)} disabled={publish.isPending} />
                        </Field>
                    )}
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    {editable && (
                        <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
                            <Button
                                type="button"
                                variant="outline"
                                className="gap-1.5"
                                disabled={!dirty || publish.isPending}
                                onClick={() => {
                                    setTerms(baseTerms)
                                    setPrivacy(basePrivacy)
                                    setNotes("")
                                    setError(null)
                                }}
                            >
                                <Undo2 className="h-4 w-4" aria-hidden /> Desfazer
                            </Button>
                            <Button type="button" className="gap-1.5" disabled={!dirty || publish.isPending} onClick={requestPublish}>
                                {publish.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                                Publicar nova versão
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Histórico de versões</CardTitle>
                    <CardDescription>Versões publicadas não mudam; cada aceite registra a versão e a data/hora.</CardDescription>
                </CardHeader>
                <CardContent>
                    {!overview.history.length ? (
                        <EmptyState title="Nenhuma versão publicada." />
                    ) : (
                        <ul className="divide-y rounded-md border" aria-label="Versões publicadas">
                            {overview.history.map((item) => (
                                <li key={item.version} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                    <span className="min-w-0">
                                        <span className="font-medium">Versão {item.version}</span>
                                        {item.version === current?.version && <span className="ml-2 text-xs text-primary">vigente</span>}
                                        <span className="block truncate text-xs text-muted-foreground">
                                            {formatDate(item.publishedAt)}
                                            {item.publishedByName ? ` · ${item.publishedByName}` : ""}
                                            {item.notes ? ` · ${item.notes}` : ""}
                                        </span>
                                    </span>
                                    <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setViewing(item.version)} aria-label={`Ver versão ${item.version}`}>
                                        <Eye className="h-4 w-4" aria-hidden /> Ver
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            <AlertDialog open={confirming} onOpenChange={(open) => !publish.isPending && setConfirming(open)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Publicar nova versão?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Todos os usuários, inclusive você, ficarão bloqueados no próximo acesso até aceitar a versão {(current?.version ?? 0) + 1}. Versões publicadas não podem ser editadas.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={publish.isPending}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction disabled={publish.isPending} onClick={(event) => { event.preventDefault(); confirmPublish() }}>
                            Publicar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <LegalVersionDialog version={viewing} onClose={() => setViewing(null)} />
        </>
    )
}

function ReadOnlyTexts({ terms, privacy }: { terms: string; privacy: string }) {
    const [tab, setTab] = useState("termos")
    return (
        <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="termos">Termos de uso</TabsTrigger>
                <TabsTrigger value="privacidade">Política de privacidade</TabsTrigger>
            </TabsList>
            <TabsContent value="termos" className="rounded-md border p-4"><Markdown>{terms}</Markdown></TabsContent>
            <TabsContent value="privacidade" className="rounded-md border p-4"><Markdown>{privacy}</Markdown></TabsContent>
        </Tabs>
    )
}

function LegalVersionDialog({ version, onClose }: { version: number | null; onClose: () => void }) {
    const query = useLegalVersion(version)
    return (
        <Dialog open={version !== null} onOpenChange={(open) => { if (!open) onClose() }}>
            <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Versão {version}</DialogTitle>
                    <DialogDescription>{query.data ? `Publicada em ${formatDate(query.data.publishedAt)}${query.data.publishedByName ? ` por ${query.data.publishedByName}` : ""}` : "Carregando..."}</DialogDescription>
                </DialogHeader>
                {query.isError && <p role="alert" className="text-sm text-destructive">{apiErrorMessage(query.error, "Não foi possível carregar a versão")}</p>}
                {query.data && <ReadOnlyTexts terms={query.data.termsOfUse} privacy={query.data.privacyPolicy} />}
            </DialogContent>
        </Dialog>
    )
}
