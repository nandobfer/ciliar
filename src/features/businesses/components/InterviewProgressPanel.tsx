"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { CheckCircle2, Circle, CircleDot, SkipForward } from "lucide-react"
import { cn } from "@/lib/utils"
import { BUSINESS_FIELD_LABELS } from "../constants"
import type { InterviewProgressDto } from "../types"

const STATUS_LABEL = { pending: "Pendente", answered: "Respondida", skipped: "Pulada" } as const

/** Painel de progresso: perguntas do roteiro (pendente, respondida, pulada) e o valor coletado. */
export function InterviewProgressPanel({ progress }: { progress: InterviewProgressDto }) {
    const reduceMotion = useReducedMotion() ?? false
    const done = progress.questions.filter((question) => question.status !== "pending").length
    const total = progress.questions.length
    return (
        <aside aria-label="Progresso da entrevista" className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border bg-card/60 p-4">
            <div className="space-y-1.5">
                <p className="text-sm font-semibold">Progresso</p>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Perguntas concluídas">
                    <motion.div className="h-full rounded-full bg-primary" initial={false} animate={{ width: `${total ? (done / total) * 100 : 0}%` }} transition={{ duration: reduceMotion ? 0 : 0.3 }} />
                </div>
                <p className="text-xs text-muted-foreground">
                    {done} de {total} pergunta(s) · roteiro v{progress.scriptVersion}
                </p>
            </div>
            <ol className="space-y-2">
                {progress.questions.map((question) => {
                    const Icon = question.status === "answered" ? CheckCircle2 : question.status === "skipped" ? SkipForward : question.current ? CircleDot : Circle
                    return (
                        <motion.li
                            key={question.field}
                            layout={!reduceMotion}
                            className={cn("rounded-lg border p-2.5 text-sm transition-colors", question.current ? "border-primary/60 bg-primary/10" : "bg-background/40")}
                            aria-current={question.current ? "step" : undefined}
                        >
                            <div className="flex items-start gap-2">
                                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", question.status === "answered" ? "text-success" : question.status === "skipped" ? "text-muted-foreground" : question.current ? "text-primary" : "text-muted-foreground/60")} aria-hidden />
                                <div className="min-w-0 flex-1">
                                    <p className="flex flex-wrap items-center gap-1.5 font-medium">
                                        {BUSINESS_FIELD_LABELS[question.field]}
                                        {question.required && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">obrigatória</span>}
                                    </p>
                                    <p className="sr-only">{STATUS_LABEL[question.status]}</p>
                                    <AnimatePresence initial={false}>
                                        {question.display && (
                                            <motion.p key="value" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-0.5 break-words text-xs text-muted-foreground">
                                                {question.display}
                                                {question.field === "type" && progress.subtype ? ` · ${progress.subtype}` : ""}
                                            </motion.p>
                                        )}
                                    </AnimatePresence>
                                    {question.status === "skipped" && <p className="mt-0.5 text-xs text-muted-foreground">Pulada: preencha depois no espaço do negócio</p>}
                                </div>
                            </div>
                        </motion.li>
                    )
                })}
            </ol>
            <p className="text-[11px] text-muted-foreground">Os dados poderão ser alterados depois no espaço do negócio.</p>
        </aside>
    )
}
