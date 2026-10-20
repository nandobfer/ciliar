"use client"

import { useEffect, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { Loader2, MessageSquare, WifiOff } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useInterruptOpex, useOpexSession, useSendOpexMessage } from "@/features/opex-agent/hooks/useOpexSessions"
import { useOpexStream } from "@/features/opex-agent/hooks/useOpexStream"
import { useOpexUploads } from "@/features/opex-agent/hooks/useOpexUploads"
import { OpexComposer, type OpexComposerAttachments } from "@/features/opex-agent/components/chat/OpexComposer"
import { OpexDropZone } from "@/features/opex-agent/components/chat/OpexDropZone"
import { buildChatItems, OpexMessageList } from "@/features/opex-agent/components/chat/OpexMessageList"
import { INTERVIEW_IMAGE_MIMES, INTERVIEW_MESSAGE_MAX } from "../constants"
import { interviewProgressKey, useRetryOpening } from "../hooks/useBusinesses"

interface InterviewChatProps {
    interviewId: string
    maxImageMb: number
    acceptsImage: boolean
    completed: boolean
}

/**
 * Chat da entrevista com os componentes do Agente Opex (mensagens, streaming, anexos). O escopo
 * (`/api/interview`) vem do `OpexScopeOverride` de quem monta. A cada gravação de resposta o painel
 * de progresso é relido.
 */
export function InterviewChat({ interviewId, maxImageMb, acceptsImage, completed }: InterviewChatProps) {
    const queryClient = useQueryClient()
    const query = useOpexSession(interviewId)
    const stream = useOpexStream(interviewId)
    const send = useSendOpexMessage(interviewId)
    const interrupt = useInterruptOpex(interviewId)
    const uploads = useOpexUploads(interviewId)
    const retryOpening = useRetryOpening(interviewId)
    const running = stream.live !== null || (stream.status ?? query.data?.session.status) === "running" || send.isPending

    // Ferramenta concluída no meio do turno (resposta gravada): relê o progresso.
    const savedTools = useMemo(() => (stream.live?.parts ?? []).filter((part) => part.type === "tool" && part.state !== "running").length, [stream.live])
    useEffect(() => {
        if (savedTools) void queryClient.invalidateQueries({ queryKey: interviewProgressKey(interviewId) })
    }, [savedTools, interviewId, queryClient])

    if (query.isLoading) {
        return (
            <div className="flex flex-1 flex-col gap-3 p-4" aria-busy>
                <Skeleton className="h-24 w-5/6" />
                <Skeleton className="ml-auto h-8 w-1/2 rounded-2xl" />
            </div>
        )
    }
    if (query.isError || !query.data) {
        return <ErrorState title="Não foi possível abrir a entrevista" description={apiErrorMessage(query.error, "Verifique a conexão e tente novamente.")} onRetry={() => void query.refetch()} />
    }

    const items = buildChatItems(query.data.messages, stream.live, stream.settled)
    const disabledReason = completed ? "Entrevista concluída" : null
    const onSend = (text: string) => {
        const ready = uploads.ready
        send.mutate({ text, files: ready.map((item) => item.uploaded!) }, { onSuccess: () => uploads.clearSent(ready.map((item) => item.localId)) })
    }
    const onFiles = (files: File[]) => {
        const images = files.filter((file) => (INTERVIEW_IMAGE_MIMES as readonly string[]).includes(file.type))
        if (images.length < files.length) toast.error("Envie uma imagem PNG, JPEG, WebP ou GIF.")
        if (images.length) uploads.enqueue(interviewId, images.slice(0, 1), { maxPerMessage: 1, maxSizeMb: maxImageMb })
    }
    const attachments: OpexComposerAttachments = { items: uploads.items, onFiles, onRetry: uploads.retry, onRemove: uploads.remove }

    return (
        <OpexDropZone onFiles={onFiles} disabled={!acceptsImage || completed}>
            <AnimatePresence initial={false}>
                {!stream.connected && stream.status !== null && (
                    <motion.p key="offline" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-center justify-center gap-1.5 overflow-hidden bg-muted/60 text-[11px] text-muted-foreground" role="status">
                        <WifiOff className="h-3 w-3" aria-hidden /> Reconectando à resposta ao vivo…
                    </motion.p>
                )}
            </AnimatePresence>
            {items.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                    {running ? (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> O entrevistador está começando…
                        </p>
                    ) : (
                        <>
                            <MessageSquare className="h-8 w-8 text-primary" aria-hidden />
                            <p className="text-sm text-muted-foreground">O entrevistador ainda não começou a conversa.</p>
                            <Button size="sm" onClick={() => retryOpening.mutate()} disabled={retryOpening.isPending}>
                                Começar a entrevista
                            </Button>
                        </>
                    )}
                </div>
            ) : (
                <OpexMessageList items={items} busy={running} deciding={false} onDecide={() => undefined} onRetry={(text) => send.mutate({ text })} label="Conversa com o Agente Entrevistador" />
            )}
            <OpexComposer
                onSend={onSend}
                attachments={attachments}
                onStop={() => interrupt.mutate()}
                running={running}
                sending={send.isPending}
                stopping={interrupt.isPending}
                disabledReason={disabledReason}
                placeholder="Responda ao entrevistador…"
                ariaLabel="Resposta para o Agente Entrevistador"
                hint={acceptsImage ? `Enter envia · Shift+Enter quebra linha · anexe a imagem da logo/foto (até ${maxImageMb} MB) · peça para corrigir uma resposta quando quiser` : "Enter envia · Shift+Enter quebra linha · peça para corrigir uma resposta quando quiser"}
                attachDisabled={!acceptsImage}
                accept={INTERVIEW_IMAGE_MIMES.join(",")}
                multiple={false}
                maxLength={INTERVIEW_MESSAGE_MAX}
            />
        </OpexDropZone>
    )
}
