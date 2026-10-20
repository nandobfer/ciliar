"use client"

import { createElement, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, ChevronRight, Loader2, ShieldAlert, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { OpexConfirmationDto, OpexPart } from "../../types"
import { toolIcon } from "../tool-icons"
import { opexToolMeta } from "../../tool-catalog"
import { maskApiTokenOutput, OpexApiTokenCard, parseApiTokenOutput } from "./OpexApiTokenCard"
import { useOpexTechnicalDetails } from "../../hooks/useOpexTechnicalDetails"

type ToolPart = Extract<OpexPart, { type: "tool" }>

const expand = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.18 } }

function formatDuration(ms: number | null): string | null {
    if (ms == null) return null
    return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`
}

interface OpexToolCardProps {
    part: ToolPart
    onDecide?: (actionId: string, decision: "confirm" | "cancel") => void
    deciding?: boolean
}

/** Chamada de ferramenta do agente: estado animado, detalhes recolhíveis e, se for o caso, a confirmação. */
export function OpexToolCard({ part, onDecide, deciding }: OpexToolCardProps) {
    const [open, setOpen] = useState(false)
    const technical = useOpexTechnicalDetails()
    const awaiting = part.confirmation?.status === "pending"
    // Sem "Ver informações técnicas": o card mostra só rótulo e estado, sem expandir.
    const hasDetails = technical && Boolean(part.input || part.output || part.error)
    // Token gerado: card próprio com copiar; nos detalhes o valor aparece mascarado.
    const apiToken = opexToolMeta(part.name)?.display === "api-token" ? parseApiTokenOutput(part.output) : null
    const output = apiToken && part.output ? maskApiTokenOutput(part.output, apiToken.token) : part.output

    return (
        <motion.div
            layout="position"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className={cn("overflow-hidden rounded-md border bg-card/60 text-xs", awaiting && "border-warning/50", part.state === "error" && !part.confirmation && "border-destructive/40")}
        >
            {hasDetails ? (
                <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-muted/50">
                    <ToolHeader part={part} technical />
                    <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }} aria-hidden>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </motion.span>
                </button>
            ) : (
                <div className="flex w-full items-center gap-2 px-2.5 py-1.5">
                    <ToolHeader part={part} technical={technical} />
                </div>
            )}
            <AnimatePresence initial={false}>
                {open && hasDetails && (
                    <motion.div key="details" {...expand} className="overflow-hidden border-t">
                        <div className="space-y-2 p-2.5">
                            {part.input && <ToolBlock label="Entrada" text={part.input} />}
                            {output && <ToolBlock label="Resultado" text={output} />}
                            {part.error && <p className="whitespace-pre-wrap break-words text-destructive">{part.error}</p>}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            {part.confirmation && <ConfirmationBlock confirmation={part.confirmation} onDecide={onDecide} deciding={deciding} />}
            {apiToken && <OpexApiTokenCard output={apiToken} />}
        </motion.div>
    )
}

function ToolHeader({ part, technical }: { part: ToolPart; technical: boolean }) {
    const duration = technical ? formatDuration(part.durationMs) : null
    return (
        <>
            {createElement(toolIcon(part.group), { className: "h-3.5 w-3.5 shrink-0 text-primary", "aria-hidden": true })}
            <span className="min-w-0 flex-1 truncate font-medium text-foreground/90">{part.label}</span>
            {technical && <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">{part.name}</span>}
            {duration && <span className="text-[10px] text-muted-foreground">{duration}</span>}
            <ToolState part={part} />
        </>
    )
}

function ToolState({ part }: { part: ToolPart }) {
    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.span key={part.state} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 0.15 }} className="inline-flex">
                {part.state === "running" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-label="Executando" />
                ) : part.state === "error" ? (
                    <X className="h-3.5 w-3.5 text-destructive" aria-label="Falhou" />
                ) : part.confirmation ? (
                    <ShieldAlert className="h-3.5 w-3.5 text-warning" aria-label="Pede confirmação" />
                ) : (
                    <Check className="h-3.5 w-3.5 text-success" aria-label="Concluída" />
                )}
            </motion.span>
        </AnimatePresence>
    )
}

function ToolBlock({ label, text }: { label: string; text: string }) {
    return (
        <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/60 p-2 font-mono text-[11px] leading-relaxed">{text}</pre>
        </div>
    )
}

const DECIDED_LABELS: Record<Exclude<OpexConfirmationDto["status"], "pending">, { text: string; className: string }> = {
    confirmed: { text: "Confirmada", className: "text-success" },
    cancelled: { text: "Cancelada", className: "text-muted-foreground" },
    failed: { text: "Falhou", className: "text-destructive" },
    expired: { text: "Expirada", className: "text-muted-foreground" },
}

function ConfirmationBlock({ confirmation, onDecide, deciding }: { confirmation: OpexConfirmationDto; onDecide?: OpexToolCardProps["onDecide"]; deciding?: boolean }) {
    return (
        <div className="border-t bg-warning/5 px-2.5 py-2">
            <p className="text-[13px] text-foreground">{confirmation.summary}</p>
            <AnimatePresence mode="wait" initial={false}>
                {confirmation.status === "pending" ? (
                    <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="mt-2 flex flex-wrap gap-2">
                        <Button type="button" size="sm" className="h-7 gap-1.5" disabled={deciding || !onDecide} onClick={() => onDecide?.(confirmation.actionId, "confirm")}>
                            <Check className="h-3.5 w-3.5" aria-hidden /> Confirmar
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5" disabled={deciding || !onDecide} onClick={() => onDecide?.(confirmation.actionId, "cancel")}>
                            <X className="h-3.5 w-3.5" aria-hidden /> Cancelar
                        </Button>
                    </motion.div>
                ) : (
                    <motion.p key={confirmation.status} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className={cn("mt-1 text-[11px] font-medium", DECIDED_LABELS[confirmation.status].className)}>
                        {DECIDED_LABELS[confirmation.status].text}
                        {confirmation.error ? `: ${confirmation.error}` : ""}
                    </motion.p>
                )}
            </AnimatePresence>
        </div>
    )
}
