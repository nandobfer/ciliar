"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AlertTriangle, CalendarRange, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatMinutes } from "@/features/orders/logic"
import { dateKeyLabel } from "@/features/orders/components/OrderBadges"
import type { DeadlineConflictDto } from "../types"
import { useDeadlineConflict, type ConflictParams } from "../hooks/useCalendar"

/**
 * Alerta de conflito de prazo (CIL-4): sobreposição (aviso informativo) e capacidade insuficiente
 * (alerta forte, "necessárias × livres"). NUNCA bloqueia a ação — só informa.
 */
export function DeadlineConflictAlert({ conflict, loading = false, className }: { conflict: DeadlineConflictDto | null | undefined; loading?: boolean; className?: string }) {
    const reduceMotion = useReducedMotion()
    const visible = conflict && conflict.level !== "none"
    return (
        <AnimatePresence initial={false}>
            {loading && !visible && (
                <motion.p key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Verificando conflitos de prazo…
                </motion.p>
            )}
            {visible && (
                <motion.div
                    key={conflict.level}
                    initial={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.18 }}
                    role="status"
                    aria-live="polite"
                    data-conflict={conflict.level}
                    className={cn(
                        "space-y-1.5 rounded-lg border p-3 text-sm",
                        conflict.level === "strong" ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-warning/50 bg-warning/10 text-warning",
                        className,
                    )}
                >
                    {conflict.capacity?.insufficient && (
                        <div className="space-y-0.5">
                            <p className="flex items-center gap-1.5 font-medium">
                                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                                Capacidade insuficiente: {formatMinutes(conflict.capacity.requiredMinutes)} necessárias × {formatMinutes(conflict.capacity.freeMinutes)} livres
                            </p>
                            <p className="text-xs opacity-90">
                                {conflict.capacity.noAvailability
                                    ? "O expediente não está configurado em nenhum negócio (Ficha › Disponibilidade): sem expediente, não há horas livres."
                                    : `Expediente até ${dateKeyLabel(conflict.dueDate)}: ${formatMinutes(conflict.capacity.availableMinutes)} · ocupado ${formatMinutes(conflict.capacity.occupiedMinutes)} (trabalhos ${formatMinutes(conflict.capacity.worksMinutes)}${conflict.capacity.busyMinutes ? `, Google ${formatMinutes(conflict.capacity.busyMinutes)}` : ""}).`}
                            </p>
                        </div>
                    )}
                    {conflict.overlap.length > 0 && (
                        <div className="space-y-0.5">
                            <p className="flex items-center gap-1.5 font-medium">
                                <CalendarRange className="h-4 w-4 shrink-0" aria-hidden />
                                Sobreposição com {conflict.overlap.length === 1 ? "1 trabalho em andamento" : `${conflict.overlap.length} trabalhos em andamento`}
                            </p>
                            <ul className="space-y-0.5 text-xs opacity-90">
                                {conflict.overlap.slice(0, 5).map((item) => (
                                    <li key={item.id}>
                                        {item.code} · {item.title} ({conflict.businessNames[item.businessId] ?? "Negócio"}, {dateKeyLabel(item.startKey)} a {dateKeyLabel(item.dueDate)})
                                    </li>
                                ))}
                                {conflict.overlap.length > 5 && <li>e mais {conflict.overlap.length - 5}…</li>}
                            </ul>
                        </div>
                    )}
                    <p className="text-xs opacity-80">É só um aviso: nada é bloqueado.{conflict.googleError ? ` Google Agenda indisponível: ${conflict.googleError}` : ""}</p>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

/** Busca e mostra o alerta (editor do pedido, envio, aceite e detalhe do trabalho). */
export function DeadlineConflictNotice({ params, enabled = true, className }: { params: ConflictParams; enabled?: boolean; className?: string }) {
    const query = useDeadlineConflict(params, enabled)
    if (!enabled) return null
    return <DeadlineConflictAlert conflict={query.data} loading={query.isFetching && !query.data} className={className} />
}
