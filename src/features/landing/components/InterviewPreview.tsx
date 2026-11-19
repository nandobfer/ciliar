"use client"

import { motion, useReducedMotion, type Variants } from "framer-motion"
import { Bot, CheckCircle2, Circle, CircleDot } from "lucide-react"
import { cn } from "@/lib/utils"
import { INTERVIEW_PREVIEW } from "../content"

const thread: Variants = { visible: { transition: { staggerChildren: 0.55, delayChildren: 0.8 } } }
const bubble: Variants = {
    hidden: { opacity: 0, y: 10, scale: 0.96 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: "easeOut" } },
}

const STATUS_ICON = { answered: CheckCircle2, current: CircleDot, pending: Circle } as const
const STATUS_LABEL = { answered: "respondida", current: "em andamento", pending: "pendente" } as const

/** Ilustração (sem dados reais) da entrevista do M1: conversa à esquerda e progresso do roteiro. */
export function InterviewPreview() {
    const reduced = useReducedMotion()
    const threadProps = reduced ? {} : { variants: thread, initial: "hidden", animate: "visible" }
    const bubbleProps = reduced ? {} : { variants: bubble }
    return (
        <figure
            aria-label="Exemplo de conversa com o Agente Entrevistador"
            className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-[0_0_80px_-24px_hsl(var(--primary))] backdrop-blur-md"
        >
            <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary"><Bot className="h-4 w-4" aria-hidden /></span>
                <span className="text-sm font-medium">Agente Entrevistador</span>
                <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                    online
                </span>
            </div>
            <div className="grid sm:grid-cols-[1fr_200px]">
                <motion.ul className="flex flex-col gap-3 p-4" {...threadProps}>
                    {INTERVIEW_PREVIEW.messages.map((message, index) => (
                        <motion.li
                            key={index}
                            {...bubbleProps}
                            className={cn(
                                "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                                message.from === "agent" ? "self-start rounded-tl-sm bg-muted text-foreground" : "self-end rounded-tr-sm bg-primary text-primary-foreground",
                            )}
                        >
                            {message.text}
                        </motion.li>
                    ))}
                    {!reduced && (
                        <motion.li {...bubbleProps} className="flex gap-1 self-start rounded-2xl rounded-tl-sm bg-muted px-3 py-3" aria-hidden>
                            {[0, 1, 2].map((dot) => (
                                <motion.span
                                    key={dot}
                                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
                                    animate={{ opacity: [0.3, 1, 0.3] }}
                                    transition={{ duration: 1.2, repeat: Infinity, delay: dot * 0.2 }}
                                />
                            ))}
                        </motion.li>
                    )}
                </motion.ul>
                <figcaption className="hidden border-l border-border/60 bg-background/40 p-4 sm:block">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Roteiro</p>
                    <ol className="mt-3 space-y-2.5">
                        {INTERVIEW_PREVIEW.questions.map((question) => {
                            const Icon = STATUS_ICON[question.status]
                            return (
                                <li key={question.label} className="flex items-start gap-2 text-xs">
                                    <Icon
                                        className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", question.status === "answered" ? "text-emerald-500" : question.status === "current" ? "text-primary" : "text-muted-foreground/60")}
                                        aria-label={STATUS_LABEL[question.status]}
                                    />
                                    <span className="min-w-0">
                                        <span className={cn("block", question.status === "pending" ? "text-muted-foreground" : "text-foreground")}>{question.label}</span>
                                        {question.value && <span className="block truncate text-muted-foreground">{question.value}</span>}
                                    </span>
                                </li>
                            )
                        })}
                    </ol>
                </figcaption>
            </div>
        </figure>
    )
}
