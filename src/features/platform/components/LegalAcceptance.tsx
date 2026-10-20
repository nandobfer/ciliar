"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Loader2, LogOut, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Markdown } from "@/components/ui/markdown"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorCode, apiErrorMessage } from "@/lib/api"
import { useAcceptLegal, useMyLegal } from "../hooks/usePlatform"

/**
 * Bloqueio do primeiro acesso e de cada nova versão dos termos/política: somente aceitar ou sair.
 * O servidor recusa toda API (exceto a própria conta) até o aceite da versão vigente.
 */
export function LegalAcceptance({ onDone, onLogout }: { onDone: () => void; onLogout: () => void }) {
    const query = useMyLegal()
    const accept = useAcceptLegal()
    const [tab, setTab] = useState("termos")
    const [agreed, setAgreed] = useState(false)
    const nothingToAccept = !!query.data && !query.data.current
    // Versão removida/ainda não publicada: a sessão é relida e o bloqueio some.
    useEffect(() => {
        if (nothingToAccept) onDone()
    }, [nothingToAccept, onDone])

    if (query.isPending) return <p role="status" className="p-8 text-muted-foreground">Carregando termos...</p>
    if (query.isError || !query.data) {
        return (
            <main className="flex min-h-dvh items-center justify-center p-4">
                <ErrorState title="Não foi possível carregar os termos" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            </main>
        )
    }
    const current = query.data.current
    if (!current) return null

    const submit = () => {
        accept.mutate(current.version, {
            onSuccess: () => {
                toast.success("Termos aceitos")
                onDone()
            },
            onError: (error) => {
                toast.error(apiErrorMessage(error, "Não foi possível registrar o aceite"))
                if (apiErrorCode(error) === "LEGAL_VERSION_OUTDATED") {
                    setAgreed(false)
                    void query.refetch()
                }
            },
        })
    }

    const renewal = query.data.acceptedVersion !== null
    return (
        <main className="flex min-h-dvh items-center justify-center p-4">
            <section className="flex w-full max-w-3xl flex-col gap-4 rounded-xl border bg-card p-6" aria-labelledby="legal-title">
                <header className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                    <div className="space-y-1">
                        <h1 id="legal-title" className="text-xl font-semibold">{renewal ? "Os termos foram atualizados" : "Termos de uso e política de privacidade"}</h1>
                        <p className="text-sm text-muted-foreground">
                            {renewal ? "Uma nova versão foi publicada. Leia e aceite para continuar usando o Ciliar." : "Para continuar, leia e aceite os termos de uso e a política de privacidade (LGPD)."}{" "}
                            Versão {current.version}, publicada em {format(new Date(current.publishedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.
                        </p>
                    </div>
                </header>
                <Tabs value={tab} onValueChange={setTab}>
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="termos">Termos de uso</TabsTrigger>
                        <TabsTrigger value="privacidade">Política de privacidade</TabsTrigger>
                    </TabsList>
                    <TabsContent value="termos" className="max-h-[50vh] overflow-y-auto rounded-md border bg-background/40 p-4">
                        <Markdown>{current.termsOfUse}</Markdown>
                    </TabsContent>
                    <TabsContent value="privacidade" className="max-h-[50vh] overflow-y-auto rounded-md border bg-background/40 p-4">
                        <Markdown>{current.privacyPolicy}</Markdown>
                    </TabsContent>
                </Tabs>
                <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={agreed} onCheckedChange={(checked) => setAgreed(checked === true)} disabled={accept.isPending} />
                    <span>Li e aceito os termos de uso e a política de privacidade (versão {current.version}).</span>
                </label>
                <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                    <Button type="button" variant="ghost" className="gap-1.5" onClick={onLogout} disabled={accept.isPending}>
                        <LogOut className="h-4 w-4" aria-hidden /> Sair
                    </Button>
                    <Button type="button" className="gap-1.5" disabled={!agreed || accept.isPending} onClick={submit}>
                        {accept.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                        Aceitar e continuar
                    </Button>
                </div>
            </section>
        </main>
    )
}
