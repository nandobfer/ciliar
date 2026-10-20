"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Building2, CalendarClock, Check, CircleDollarSign, FileText, Globe, Pencil, Sparkles, Tag, Target, type LucideIcon } from "lucide-react"
import { withBasePath } from "@/lib/base-path"
import { cn } from "@/lib/utils"
import { BUSINESS_FIELD_LABELS, BUSINESS_TYPE_LABELS, type BusinessField, type BusinessType } from "../../constants"
import type { InterviewProgressDto, InterviewQuestionProgressDto } from "../../types"

const FIELD_ICONS: Record<BusinessField, LucideIcon> = {
    name: Building2,
    type: Tag,
    segment: Sparkles,
    description: FileText,
    logo: Building2,
    links: Globe,
    availability: CalendarClock,
    goals: Target,
    currency: CircleDollarSign,
}

const SAVED_FLASH_MS = 2500

/** Campos que acabaram de ser gravados (o "✓ salvo" some sozinho). */
function useRecentlySaved(questions: readonly InterviewQuestionProgressDto[]): ReadonlySet<BusinessField> {
    const previous = useRef<Map<BusinessField, string> | null>(null)
    const [recent, setRecent] = useState<ReadonlySet<BusinessField>>(new Set())
    useEffect(() => {
        const current = new Map(questions.map((question) => [question.field, `${question.status}:${question.display ?? ""}`]))
        const before = previous.current
        previous.current = current
        if (!before) return
        const changed = questions.filter((question) => question.status === "answered" && before.get(question.field) !== current.get(question.field)).map((question) => question.field)
        if (!changed.length) return
        setRecent((value) => new Set([...value, ...changed]))
        const timer = setTimeout(() => setRecent((value) => new Set([...value].filter((field) => !changed.includes(field)))), SAVED_FLASH_MS)
        return () => clearTimeout(timer)
    }, [questions])
    return recent
}

interface BusinessDraftCardProps {
    progress: InterviewProgressDto
    /** Clicar em uma resposta (ou pulada) abre o controle para corrigir. */
    onEdit?: (field: BusinessField) => void
    editing?: BusinessField | null
    className?: string
}

/**
 * Ficha do negócio sendo montada ao vivo pela entrevista: cada resposta gravada entra com animação e
 * um "✓ salvo" discreto (no lugar dos cards de ferramenta do chat). Pendentes ficam vazias; a atual
 * fica destacada; puladas mostram "Preencher depois".
 */
export function BusinessDraftCard({ progress, onEdit, editing = null, className }: BusinessDraftCardProps) {
    const reduceMotion = useReducedMotion() ?? false
    const recent = useRecentlySaved(progress.questions)
    const done = progress.questions.filter((question) => question.status !== "pending").length
    const total = progress.questions.length
    const byField = new Map(progress.questions.map((question) => [question.field, question]))
    const name = byField.get("name")
    const logo = byField.get("logo")
    const logoFile = logo?.status === "answered" ? (logo.value as { fileId?: string } | null) : null
    const completed = progress.status === "completed"
    const canEdit = !completed && Boolean(onEdit)
    const rows = progress.questions.filter((question) => question.field !== "name" && question.field !== "logo")

    return (
        <aside aria-label="Ficha do negócio" className={cn("flex min-h-0 flex-col gap-4 overflow-y-auto rounded-2xl border bg-card/70 p-5", className)}>
            <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Ficha do negócio</span>
                    <span>
                        {done} de {total}
                    </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Perguntas concluídas">
                    <motion.div className={cn("h-full rounded-full", completed ? "bg-success" : "bg-primary")} initial={false} animate={{ width: `${total ? (done / total) * 100 : 0}%` }} transition={{ duration: reduceMotion ? 0 : 0.4 }} />
                </div>
            </div>

            <div className="flex items-center gap-4">
                <EditableArea field="logo" question={logo} canEdit={canEdit} editing={editing} onEdit={onEdit} className="shrink-0 rounded-2xl">
                    <div className={cn("flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border", logo?.current ? "border-primary ring-2 ring-primary/30" : "border-dashed bg-muted/40")}>
                        {logoFile?.fileId ? (
                            // eslint-disable-next-line @next/next/no-img-element -- imagem da entrevista (rota autorizada)
                            <img src={withBasePath(`/api/interview/files/${logoFile.fileId}`)} alt="Logo do negócio" className="h-full w-full object-cover" />
                        ) : (
                            <Building2 className="h-6 w-6 text-muted-foreground/60" aria-hidden />
                        )}
                    </div>
                </EditableArea>
                <EditableArea field="name" question={name} canEdit={canEdit} editing={editing} onEdit={onEdit} className="min-w-0 flex-1 rounded-lg">
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.p key={name?.display ?? "pending"} initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cn("truncate text-xl font-semibold", !name?.display && "text-muted-foreground/60")}>
                            {name?.display ?? (name?.status === "skipped" ? "Negócio sem nome" : "Nome do negócio")}
                        </motion.p>
                    </AnimatePresence>
                    {byField.get("type")?.status === "answered" && (
                        <p className="text-xs text-muted-foreground">
                            {BUSINESS_TYPE_LABELS[byField.get("type")!.value as BusinessType] ?? ""}
                            {progress.subtype ? ` · ${progress.subtype}` : ""}
                        </p>
                    )}
                    <SavedMark show={recent.has("name") || recent.has("logo")} />
                </EditableArea>
            </div>

            <ul className="space-y-1">
                {rows.map((question) => {
                    const Icon = FIELD_ICONS[question.field]
                    return (
                        <motion.li key={question.field} layout={!reduceMotion}>
                            <EditableArea field={question.field} question={question} canEdit={canEdit} editing={editing} onEdit={onEdit} className={cn("rounded-xl p-2.5", question.current && "bg-primary/10 ring-1 ring-primary/40")}>
                                <div className="flex items-start gap-3">
                                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", question.status === "answered" ? "text-primary" : "text-muted-foreground/50")} aria-hidden />
                                    <div className="min-w-0 flex-1">
                                        <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                            {BUSINESS_FIELD_LABELS[question.field]}
                                            {question.current && <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">agora</span>}
                                        </p>
                                        <AnimatePresence mode="wait" initial={false}>
                                            <motion.p key={`${question.status}:${question.display ?? ""}`} initial={reduceMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cn("break-words text-sm", question.status !== "answered" && "text-muted-foreground/60")}>
                                                {question.status === "answered" ? question.field === "type" && progress.subtype ? `${question.display} · ${progress.subtype}` : question.display : question.status === "skipped" ? "Preencher depois" : question.current ? "Respondendo…" : "—"}
                                            </motion.p>
                                        </AnimatePresence>
                                    </div>
                                    <SavedMark show={recent.has(question.field)} />
                                </div>
                            </EditableArea>
                        </motion.li>
                    )
                })}
            </ul>
            <p className="mt-auto text-[11px] text-muted-foreground">{completed ? "Negócio criado. Os dados podem ser alterados no espaço do negócio." : canEdit ? "Clique em uma resposta para corrigir. Tudo pode ser alterado depois no espaço do negócio." : "Os dados poderão ser alterados depois no espaço do negócio."}</p>
        </aside>
    )
}

function SavedMark({ show }: { show: boolean }) {
    return (
        <AnimatePresence>
            {show && (
                <motion.span key="saved" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success" role="status">
                    <Check className="h-3 w-3" aria-hidden /> salvo
                </motion.span>
            )}
        </AnimatePresence>
    )
}

/** Resposta (ou pulada) clicável para corrigir; pendente não é clicável. */
function EditableArea({ field, question, canEdit, editing, onEdit, className, children }: { field: BusinessField; question: InterviewQuestionProgressDto | undefined; canEdit: boolean; editing: BusinessField | null; onEdit?: (field: BusinessField) => void; className?: string; children: ReactNode }) {
    const editable = canEdit && question && question.status !== "pending"
    if (!question) return <div className={className}>{children}</div>
    if (!editable) return <div className={className}>{children}</div>
    return (
        <button
            type="button"
            onClick={() => onEdit?.(field)}
            title={`Corrigir ${BUSINESS_FIELD_LABELS[field]}`}
            aria-pressed={editing === field}
            className={cn("group relative block w-full text-left transition-colors hover:bg-muted/50", editing === field && "bg-muted/60 ring-1 ring-primary/40", className)}
        >
            <span className="sr-only">Corrigir {BUSINESS_FIELD_LABELS[field]}: </span>
            {children}
            <Pencil className="absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
        </button>
    )
}
