"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { motion, useReducedMotion } from "framer-motion"
import { ArchiveRestore, ArrowRight, Clock, LogOut, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { api, apiErrorCode, apiErrorMessage } from "@/lib/api"
import { withBasePath } from "@/lib/base-path"
import { cn } from "@/lib/utils"
import { businessesChannel } from "@/lib/pusher/channel-names"
import { useAppSession } from "@/features/access/components/AccessProvider"
import { OpexScopeOverride, type OpexUiScope } from "@/features/opex-agent/components/OpexScopeProvider"
import { OpexUploadsProvider } from "@/features/opex-agent/hooks/useOpexUploads"
import { INTERVIEW_QUERY_PREFIX, refreshSession, useBusinesses, useBusinessesRealtime, useDiscardInterview, useInterviewProgress, useInterviewState, useRestoreBusiness, useStartInterview } from "../hooks/useBusinesses"
import { InterviewWorkspace } from "./interview/InterviewWorkspace"

interface InterviewScreenProps {
    /** `onboarding`: tela cheia obrigatória (sem sidebar, só sair). `page`: `/negocios/novo` dentro do shell. */
    mode: "onboarding" | "page"
}

/** Entrevista do novo negócio: pergunta em foco + ficha do negócio sendo montada. Sem formulário de contingência. */
export function InterviewScreen({ mode }: InterviewScreenProps) {
    const { session, logout } = useAppSession()
    const userId = session?.user.id ?? "anonimo"
    const scope = useMemo<OpexUiScope>(
        () => ({ kind: "owner", apiBase: "/interview", http: api, channel: businessesChannel(userId), queryPrefix: INTERVIEW_QUERY_PREFIX, tabsKey: "", settingsHref: null, clientName: null }),
        [userId],
    )
    useBusinessesRealtime(session?.user.id ?? null, !session?.access.simulation)
    const content = <InterviewContent mode={mode} />
    if (mode === "page") return <OpexScopeOverride value={scope}><OpexUploadsProvider>{content}</OpexUploadsProvider></OpexScopeOverride>
    return (
        <OpexScopeOverride value={scope}>
            <OpexUploadsProvider>
                <div className="flex h-full flex-col bg-background">
                    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
                        <div className="flex items-center gap-2.5">
                            {/* eslint-disable-next-line @next/next/no-img-element -- marca pequena e estática */}
                            <img src={withBasePath("/opex-mark.png")} alt="" className="h-8 w-8" />
                            <span className="text-sm font-semibold">Ciliar</span>
                        </div>
                        <Button variant="ghost" size="sm" className="gap-1.5" onClick={logout}>
                            <LogOut className="h-4 w-4" aria-hidden /> Sair
                        </Button>
                    </header>
                    <div className="min-h-0 flex-1 p-3 md:p-6">{content}</div>
                </div>
            </OpexUploadsProvider>
        </OpexScopeOverride>
    )
}

function InterviewContent({ mode }: InterviewScreenProps) {
    const router = useRouter()
    const queryClient = useQueryClient()
    const reduceMotion = useReducedMotion() ?? false
    const state = useInterviewState()
    const start = useStartInterview()
    const [startError, setStartError] = useState<unknown>(null)
    const started = useRef(false)
    const interviewId = state.data?.current?.id ?? start.data?.id ?? null
    const progress = useInterviewProgress(interviewId)
    const discard = useDiscardInterview()
    const [confirmDiscard, setConfirmDiscard] = useState(false)
    const available = state.data?.status.available ?? false

    // Sem entrevista em andamento: começa (uma por dono; o servidor devolve a existente).
    useEffect(() => {
        if (!state.data || state.data.current || !available || started.current) return
        started.current = true
        start.mutate(undefined, { onError: (error) => setStartError(error) })
    }, [state.data, available, start])

    const data = progress.data
    const completedBusiness = data?.status === "completed" ? data.businessId : null
    useEffect(() => {
        if (!completedBusiness) return
        const timer = setTimeout(() => {
            refreshSession()
            void queryClient.invalidateQueries({ queryKey: ["businesses"] })
            router.replace(`/negocios/${completedBusiness}`)
        }, 2500)
        return () => clearTimeout(timer)
    }, [completedBusiness, router, queryClient])

    if (state.isLoading) return <Skeleton className="h-full min-h-96 w-full" />
    if (state.isError || !state.data) return <ErrorState title="Não foi possível abrir a entrevista" description={apiErrorMessage(state.error, "Tente novamente.")} onRetry={() => void state.refetch()} />
    if (!available && !interviewId) return <Unavailable mode={mode} />
    if (startError) {
        const limit = apiErrorCode(startError) === "BUSINESS_LIMIT_REACHED"
        return (
            <div className="space-y-4">
                <ErrorState title={limit ? "Limite de negócios atingido" : "Não foi possível começar a entrevista"} description={apiErrorMessage(startError, "Tente novamente.")} onRetry={limit ? undefined : () => { setStartError(null); started.current = false; void state.refetch() }} />
                {limit && <div className="flex justify-center"><Button variant="outline" onClick={() => router.push("/negocios")}>Gerenciar negócios</Button></div>}
            </div>
        )
    }
    if (!interviewId || !data) return <Skeleton className="h-full min-h-96 w-full" />
    if (!available && data.status === "in_progress") return <Unavailable mode={mode} />

    return (
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("flex h-full min-h-0 flex-col gap-4", mode === "page" && "h-[calc(100dvh-7rem)]")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold md:text-2xl">Novo negócio</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Responda às perguntas: ao fim, o negócio é criado e você vai para o espaço dele.</p>
                </div>
                {data.canDiscard && (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setConfirmDiscard(true)}>
                        <Trash2 className="h-4 w-4" aria-hidden /> Descartar entrevista
                    </Button>
                )}
            </div>
            {mode === "onboarding" && <ArchivedAlternative />}
            {completedBusiness && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm" role="status">
                    <span>Negócio criado! Levando você ao espaço do negócio…</span>
                    <Button size="sm" className="gap-1.5" onClick={() => router.replace(`/negocios/${completedBusiness}`)}>
                        Ir agora <ArrowRight className="h-4 w-4" aria-hidden />
                    </Button>
                </div>
            )}
            <InterviewWorkspace progress={data} maxImageMb={state.data.status.maxImageMb} />
            <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Descartar a entrevista?</AlertDialogTitle>
                        <AlertDialogDescription>As respostas, a transcrição e as imagens enviadas serão apagadas. Esta ação não pode ser desfeita.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => discard.mutate(interviewId, { onSuccess: () => router.replace("/negocios") })}
                        >
                            Descartar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </motion.div>
    )
}

/** IA indisponível: bloqueio "tente mais tarde" (o admin é alertado pelo servidor). */
function Unavailable({ mode }: InterviewScreenProps) {
    const { logout } = useAppSession()
    return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center" role="alert">
            <span className="rounded-full bg-warning/15 p-3 text-warning">
                <Clock className="h-6 w-6" aria-hidden />
            </span>
            <h1 className="text-lg font-semibold">Criação de negócios indisponível</h1>
            <p className="max-w-md text-sm text-muted-foreground">O assistente que conduz a entrevista está indisponível no momento. Tente mais tarde: a administração já foi avisada.</p>
            {mode === "onboarding" && <ArchivedAlternative />}
            {mode === "onboarding" && (
                <Button variant="outline" onClick={logout}>
                    Sair
                </Button>
            )}
        </div>
    )
}

/** Onboarding sem negócio ativo, mas com arquivados: restaurar um deles é a alternativa à entrevista. */
function ArchivedAlternative() {
    const { session } = useAppSession()
    const archived = session?.onboarding?.archived ?? 0
    const list = useBusinesses(archived > 0)
    const restore = useRestoreBusiness()
    const items = (list.data?.items ?? []).filter((item) => item.status === "archived")
    if (!archived || !items.length) return null
    return (
        <div className="w-full max-w-3xl space-y-2 rounded-lg border bg-card/60 p-3 text-left text-sm">
            <p className="font-medium">Você tem negócio(s) arquivado(s). Restaure um para continuar sem a entrevista:</p>
            <ul className="space-y-1.5">
                {items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">{item.name}</span>
                        <Button size="sm" variant="outline" className="gap-1.5" disabled={restore.isPending} onClick={() => restore.mutate(item.id)}>
                            <ArchiveRestore className="h-4 w-4" aria-hidden /> Restaurar
                        </Button>
                    </li>
                ))}
            </ul>
        </div>
    )
}
