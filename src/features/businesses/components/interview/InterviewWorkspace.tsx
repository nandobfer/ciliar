"use client"

import { useEffect, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AlertTriangle, ClipboardList, Loader2, MessagesSquare, RotateCcw, WifiOff, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/ui/markdown"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useInterruptOpex, useOpexSession, useSendOpexMessage } from "@/features/opex-agent/hooks/useOpexSessions"
import { useOpexStream } from "@/features/opex-agent/hooks/useOpexStream"
import { useOpexUploads } from "@/features/opex-agent/hooks/useOpexUploads"
import { OpexComposer } from "@/features/opex-agent/components/chat/OpexComposer"
import type { OpexMessageDto } from "@/features/opex-agent/types"
import { BUSINESS_FIELD_LABELS, INTERVIEW_IMAGE_MIMES, INTERVIEW_MESSAGE_MAX, type BusinessField } from "../../constants"
import { correctionMessage, currentExchange, SKIP_MESSAGE } from "../../interview-answers"
import { interviewProgressKey, useRetryOpening } from "../../hooks/useBusinesses"
import type { InterviewProgressDto } from "../../types"
import { BusinessDraftCard } from "./BusinessDraftCard"
import { InterviewAnswerControl } from "./InterviewAnswerControl"

interface InterviewWorkspaceProps {
    progress: InterviewProgressDto
    maxImageMb: number
}

/**
 * Entrevista em "pergunta em foco" + ficha do negócio sendo montada (no lugar do chat): a fala atual
 * do entrevistador vira o texto da página, os controles próprios de cada pergunta montam a resposta e
 * a enviam como mensagem, e a ficha mostra o que já foi gravado. O histórico fica em "Ver conversa".
 * Mesmo motor do Agente Opex (sessão, stream NDJSON, uploads).
 */
export function InterviewWorkspace({ progress, maxImageMb }: InterviewWorkspaceProps) {
    const interviewId = progress.id
    const queryClient = useQueryClient()
    const reduceMotion = useReducedMotion() ?? false
    const query = useOpexSession(interviewId)
    const stream = useOpexStream(interviewId)
    const send = useSendOpexMessage(interviewId)
    const interrupt = useInterruptOpex(interviewId)
    const uploads = useOpexUploads(interviewId)
    const retryOpening = useRetryOpening(interviewId)
    const [editing, setEditing] = useState<BusinessField | null>(null)
    const [transcriptOpen, setTranscriptOpen] = useState(false)
    const [cardOpen, setCardOpen] = useState(false)
    const running = stream.live !== null || (stream.status ?? query.data?.session.status) === "running" || send.isPending
    const completed = progress.status === "completed"

    // Resposta gravada no meio do turno: relê a ficha.
    const savedTools = useMemo(() => (stream.live?.parts ?? []).filter((part) => part.type === "tool" && part.state !== "running").length, [stream.live])
    useEffect(() => {
        if (savedTools) void queryClient.invalidateQueries({ queryKey: interviewProgressKey(interviewId) })
    }, [savedTools, interviewId, queryClient])

    if (query.isLoading) {
        return (
            <div className="flex flex-1 flex-col gap-4 p-4" aria-busy>
                <Skeleton className="h-10 w-2/3" />
                <Skeleton className="h-32 w-full" />
            </div>
        )
    }
    if (query.isError || !query.data) return <ErrorState title="Não foi possível abrir a entrevista" description={apiErrorMessage(query.error, "Verifique a conexão e tente novamente.")} onRetry={() => void query.refetch()} />

    const messages = query.data.messages
    // A resposta recém-terminada vale até a gravada chegar (mesmo id).
    const live = stream.live ?? (stream.settled && !messages.some((message) => message.id === stream.settled!.id) ? stream.settled : null)
    const exchange = currentExchange(messages, live)
    const total = progress.questions.length
    const currentIndex = progress.questions.findIndex((question) => question.current)
    const current = currentIndex >= 0 ? progress.questions[currentIndex]! : null
    const editingQuestion = editing ? (progress.questions.find((question) => question.field === editing) ?? null) : null
    const controlQuestion = editingQuestion ?? current
    const currency = typeof progress.questions.find((question) => question.field === "currency")?.value === "string" ? (progress.questions.find((question) => question.field === "currency")!.value as string) : "BRL"
    const thinking = running && !exchange.agentText
    const failed = !running && exchange.lastAgent && exchange.lastAgent.status !== "complete" ? exchange.lastAgent : null

    const sendText = (text: string, withFiles = false) => {
        const ready = withFiles ? uploads.ready : []
        send.mutate({ text, files: ready.map((item) => item.uploaded!) }, { onSuccess: () => ready.length && uploads.clearSent(ready.map((item) => item.localId)) })
    }
    const onControlSubmit = (text: string, withFiles?: boolean) => {
        sendText(editing ? correctionMessage(editing, text) : text, withFiles)
        setEditing(null)
    }
    const onFreeText = (text: string) => {
        const ready = uploads.ready
        send.mutate({ text, files: ready.map((item) => item.uploaded!) }, { onSuccess: () => uploads.clearSent(ready.map((item) => item.localId)) })
        setEditing(null)
    }
    const onFiles = (files: File[]) => {
        const images = files.filter((file) => (INTERVIEW_IMAGE_MIMES as readonly string[]).includes(file.type))
        if (images.length < files.length) toast.error("Envie uma imagem PNG, JPEG, WebP ou GIF.")
        if (images.length) uploads.enqueue(interviewId, images.slice(0, 1), { maxPerMessage: 1, maxSizeMb: maxImageMb })
    }
    const startEdit = (field: BusinessField) => {
        setEditing(field)
        setCardOpen(false)
    }
    const logoControl = controlQuestion?.field === "logo"
    const card = (className?: string) => <BusinessDraftCard progress={progress} onEdit={running ? undefined : startEdit} editing={editing} className={className} />

    return (
        <div className="grid h-full min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section aria-label="Pergunta atual" className="flex min-h-[460px] min-w-0 flex-col overflow-hidden rounded-2xl border bg-popover">
                <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-muted-foreground">
                            {editingQuestion ? `Corrigindo · ${BUSINESS_FIELD_LABELS[editingQuestion.field]}` : current ? `Pergunta ${currentIndex + 1} de ${total} · ${BUSINESS_FIELD_LABELS[current.field]}` : completed ? "Entrevista concluída" : "Entrevista"}
                            {!editingQuestion && current && <span className="ml-1.5 text-muted-foreground/70">({current.required ? "obrigatória" : "opcional"})</span>}
                        </p>
                        {/* No celular a ficha some: a barra de progresso fica aqui. */}
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted lg:hidden" aria-hidden>
                            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${total ? (progress.questions.filter((question) => question.status !== "pending").length / total) * 100 : 0}%` }} />
                        </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                        <Button type="button" variant="ghost" size="sm" className="gap-1.5 lg:hidden" onClick={() => setCardOpen(true)}>
                            <ClipboardList className="h-4 w-4" aria-hidden /> Ver ficha
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setTranscriptOpen(true)}>
                            <MessagesSquare className="h-4 w-4" aria-hidden /> Ver conversa
                        </Button>
                    </div>
                </div>

                <AnimatePresence initial={false}>
                    {!stream.connected && stream.status !== null && (
                        <motion.p key="offline" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-center justify-center gap-1.5 overflow-hidden bg-muted/60 text-[11px] text-muted-foreground" role="status">
                            <WifiOff className="h-3 w-3" aria-hidden /> Reconectando à resposta ao vivo…
                        </motion.p>
                    )}
                </AnimatePresence>

                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-5 py-8 md:px-8">
                        {messages.length === 0 && !running ? (
                            <div className="flex flex-col items-center gap-3 text-center">
                                <p className="text-sm text-muted-foreground">O entrevistador ainda não começou.</p>
                                <Button onClick={() => retryOpening.mutate()} disabled={retryOpening.isPending}>
                                    Começar a entrevista
                                </Button>
                            </div>
                        ) : (
                            <>
                                {exchange.lastUser && !editingQuestion && (
                                    <p className="line-clamp-2 text-sm text-muted-foreground">
                                        <span className="font-medium">Você respondeu:</span> {exchange.lastUser.text || exchange.lastUser.files.map((file) => file.name).join(", ")}
                                    </p>
                                )}
                                <AnimatePresence mode="wait" initial={false}>
                                    <motion.div
                                        key={editingQuestion ? `edit-${editingQuestion.field}` : (live?.id ?? exchange.lastAgent?.id ?? "none")}
                                        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
                                        transition={{ duration: 0.25 }}
                                        aria-live="polite"
                                    >
                                        {editingQuestion ? (
                                            <h2 className="text-xl font-semibold leading-snug md:text-2xl">Qual é o valor correto de {BUSINESS_FIELD_LABELS[editingQuestion.field].toLowerCase()}?</h2>
                                        ) : thinking ? (
                                            <p className="flex items-center gap-2 text-base text-muted-foreground" role="status">
                                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> O entrevistador está pensando…
                                            </p>
                                        ) : (
                                            <Markdown className="text-lg leading-relaxed md:text-xl [&_p]:my-2">{exchange.agentText}</Markdown>
                                        )}
                                    </motion.div>
                                </AnimatePresence>
                                {failed && <FailedTurn message={failed} onRetry={() => exchange.lastUser && sendText(exchange.lastUser.text)} disabled={!exchange.lastUser} />}
                                {controlQuestion && !completed && (
                                    <motion.div key={`${controlQuestion.field}-${editing ? "edit" : "ask"}-${exchange.lastUser?.id ?? "start"}`} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                                        <InterviewAnswerControl
                                            field={controlQuestion.field}
                                            value={editingQuestion ? editingQuestion.value : null}
                                            subtype={progress.subtype}
                                            currency={currency}
                                            required={editingQuestion ? true : controlQuestion.required}
                                            disabled={running}
                                            submitLabel={editingQuestion ? "Corrigir" : "Continuar"}
                                            onSubmit={onControlSubmit}
                                            onSkip={editingQuestion ? undefined : () => sendText(SKIP_MESSAGE)}
                                            logo={{ items: uploads.items, ready: uploads.ready, onFiles, onRetry: uploads.retry, onRemove: uploads.remove, maxImageMb }}
                                        />
                                        {editingQuestion && (
                                            <Button type="button" variant="ghost" size="sm" className="mt-2 gap-1.5" onClick={() => setEditing(null)}>
                                                <X className="h-4 w-4" aria-hidden /> Cancelar correção
                                            </Button>
                                        )}
                                    </motion.div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <div className="border-t bg-background/40">
                    <OpexComposer
                        onSend={onFreeText}
                        attachments={{ items: logoControl ? [] : uploads.items, onFiles, onRetry: uploads.retry, onRemove: uploads.remove }}
                        onStop={() => interrupt.mutate()}
                        running={running}
                        sending={send.isPending}
                        stopping={interrupt.isPending}
                        disabledReason={completed ? "Entrevista concluída" : null}
                        placeholder="Prefere escrever? Responda com as suas palavras ou peça para corrigir algo…"
                        ariaLabel="Resposta livre para o Agente Entrevistador"
                        hint="Enter envia · Shift+Enter quebra linha · clique em uma resposta da ficha para corrigir"
                        attachDisabled={!progress.acceptsImage || logoControl}
                        accept={INTERVIEW_IMAGE_MIMES.join(",")}
                        multiple={false}
                        maxLength={INTERVIEW_MESSAGE_MAX}
                    />
                </div>
            </section>

            {card("hidden lg:flex")}

            <Sheet open={cardOpen} onOpenChange={setCardOpen}>
                <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
                    <SheetHeader>
                        <SheetTitle>Ficha do negócio</SheetTitle>
                        <SheetDescription>O que já foi respondido na entrevista.</SheetDescription>
                    </SheetHeader>
                    {card("mt-4 border-0 bg-transparent p-0")}
                </SheetContent>
            </Sheet>
            <TranscriptSheet open={transcriptOpen} onOpenChange={setTranscriptOpen} messages={messages} />
        </div>
    )
}

function FailedTurn({ message, onRetry, disabled }: { message: OpexMessageDto; onRetry: () => void; disabled: boolean }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert">
            <span className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                {message.status === "interrupted" ? "Resposta interrompida." : (message.error ?? "O entrevistador não conseguiu responder.")}
            </span>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={disabled} onClick={onRetry}>
                <RotateCcw className="h-4 w-4" aria-hidden /> Tentar novamente
            </Button>
        </div>
    )
}

/** "Ver conversa": a transcrição em texto (sem ferramentas nem raciocínio), somente leitura. */
function TranscriptSheet({ open, onOpenChange, messages }: { open: boolean; onOpenChange: (open: boolean) => void; messages: readonly OpexMessageDto[] }) {
    const items = messages.filter((message) => message.kind === "message")
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
                <SheetHeader>
                    <SheetTitle>Conversa da entrevista</SheetTitle>
                    <SheetDescription>Tudo o que foi dito até agora.</SheetDescription>
                </SheetHeader>
                <ol className="mt-4 space-y-4" aria-label="Transcrição da entrevista">
                    {items.map((message) => {
                        const text =
                            message.role === "assistant"
                                ? message.parts
                                      .filter((part) => part.type === "text")
                                      .map((part) => (part as { text: string }).text)
                                      .join("\n\n") || message.text
                                : message.text
                        return (
                            <li key={message.id} className={cn("space-y-1 border-l-2 pl-3", message.role === "assistant" ? "border-primary/60" : "border-muted-foreground/30")}>
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{message.role === "assistant" ? "Entrevistador" : "Você"}</p>
                                {text && <Markdown className="text-sm [&_p]:my-1">{text}</Markdown>}
                                {message.files.length > 0 && <p className="text-xs text-muted-foreground">Anexo: {message.files.map((file) => file.name).join(", ")}</p>}
                            </li>
                        )
                    })}
                </ol>
            </SheetContent>
        </Sheet>
    )
}
