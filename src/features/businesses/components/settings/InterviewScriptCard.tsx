"use client"

import { useState } from "react"
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { format } from "date-fns"
import { Eye, GripVertical, History, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { BUSINESS_FIELD_LABELS, BUSINESS_FIELDS, type BusinessField, type InterviewQuestionDef } from "../../constants"
import { interviewQuestionsSchema } from "../../schemas"
import type { InterviewerSettingsDto } from "../../types"
import { useInterviewScriptVersion } from "../../hooks/useInterviewerSettings"

interface InterviewScriptCardProps {
    data: InterviewerSettingsDto
    draft: InterviewQuestionDef[]
    onChange: (next: InterviewQuestionDef[]) => void
    notes: string
    onNotesChange: (notes: string) => void
    readOnly: boolean
}

// @dnd-kit v6 devolve propriedades de render junto de setNodeRef; não lemos ref.current aqui.
/* eslint-disable react-hooks/refs */
function SortableQuestion({ question, index, available, readOnly, onPatch, onRemove }: { question: InterviewQuestionDef; index: number; available: BusinessField[]; readOnly: boolean; onPatch: (patch: Partial<InterviewQuestionDef>) => void; onRemove: () => void }) {
    const sortable = useSortable({ id: question.field, disabled: readOnly })
    const id = (name: string) => `script-${question.field}-${name}`
    return (
        <li ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} className="flex gap-3 rounded-lg border bg-background/40 p-3">
            <Button type="button" variant="ghost" size="icon" className="mt-6 shrink-0" aria-label={`Reordenar a pergunta ${index + 1}`} disabled={readOnly} {...sortable.attributes} {...sortable.listeners}>
                <GripVertical className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[200px] flex-1 space-y-1.5">
                        <label htmlFor={id("field")} className="text-xs font-semibold">
                            {index + 1}. Campo
                        </label>
                        <Select value={question.field} disabled={readOnly} onValueChange={(value) => value && onPatch({ field: value as BusinessField })}>
                            <SelectTrigger id={id("field")} className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {[question.field, ...available].map((field) => (
                                    <SelectItem key={field} value={field}>
                                        {BUSINESS_FIELD_LABELS[field]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <label className="flex items-center gap-2 pb-2 text-sm">
                        <Checkbox checked={question.required} disabled={readOnly} onCheckedChange={(value) => onPatch({ required: value === true })} />
                        Obrigatória
                    </label>
                    <label className="flex items-center gap-2 pb-2 text-sm">
                        <Switch checked={question.active} disabled={readOnly} onCheckedChange={(value) => onPatch({ active: value })} aria-label="Pergunta ativa" />
                        Ativa
                    </label>
                    {!readOnly && (
                        <Button type="button" variant="ghost" size="icon" className="mb-0.5 text-muted-foreground hover:text-destructive" aria-label={`Remover a pergunta ${index + 1}`} onClick={onRemove}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
                <div className="space-y-1.5">
                    <label htmlFor={id("prompt")} className="text-xs font-semibold">
                        Texto/orientação da pergunta
                    </label>
                    <Textarea id={id("prompt")} rows={2} value={question.prompt} disabled={readOnly} onChange={(event) => onPatch({ prompt: event.target.value })} />
                </div>
            </div>
        </li>
    )
}
/* eslint-enable react-hooks/refs */

/** Editor do roteiro (ordem por arrastar, campo, texto, obrigatória, ativa) e o histórico de versões. */
export function InterviewScriptCard({ data, draft, onChange, notes, onNotesChange, readOnly }: InterviewScriptCardProps) {
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
    const [viewing, setViewing] = useState<number | null>(null)
    const version = useInterviewScriptVersion(viewing)
    const used = new Set(draft.map((question) => question.field))
    const available = BUSINESS_FIELDS.filter((field) => !used.has(field))
    const validation = interviewQuestionsSchema.safeParse(draft)
    const onDragEnd = (event: DragEndEvent) => {
        if (!event.over || event.active.id === event.over.id) return
        const from = draft.findIndex((question) => question.field === event.active.id)
        const to = draft.findIndex((question) => question.field === event.over?.id)
        if (from >= 0 && to >= 0) onChange(arrayMove(draft, from, to))
    }
    const patch = (index: number, change: Partial<InterviewQuestionDef>) => onChange(draft.map((question, position) => (position === index ? { ...question, ...change } : question)))

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Roteiro</CardTitle>
                    <CardDescription>
                        Perguntas em ordem, cada uma ligada a um campo nativo do negócio (no máximo uma vez). O subtipo (MEI, ME, EPP…) é interpretado pelo agente, sem pergunta. Cada gravação cria uma versão; a entrevista usa sempre a versão com que começou. Vigente: v{data.script.version}.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                        <SortableContext items={draft.map((question) => question.field)} strategy={verticalListSortingStrategy}>
                            <ol className="space-y-2">
                                {draft.map((question, index) => (
                                    <SortableQuestion key={question.field} question={question} index={index} available={available} readOnly={readOnly} onPatch={(change) => patch(index, change)} onRemove={() => onChange(draft.filter((_, position) => position !== index))} />
                                ))}
                            </ol>
                        </SortableContext>
                    </DndContext>
                    {!readOnly && available.length > 0 && (
                        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onChange([...draft, { field: available[0]!, prompt: `Pergunte sobre: ${BUSINESS_FIELD_LABELS[available[0]!]}`, required: false, active: true }])}>
                            <Plus className="h-4 w-4" aria-hidden /> Adicionar pergunta
                        </Button>
                    )}
                    {!validation.success && <p role="alert" className="text-xs text-destructive">{validation.error.issues[0]?.message}</p>}
                    {!readOnly && (
                        <div className="space-y-1.5">
                            <label htmlFor="script-notes" className="text-xs font-semibold">
                                Notas da nova versão (opcional)
                            </label>
                            <Input id="script-notes" value={notes} maxLength={500} onChange={(event) => onNotesChange(event.target.value)} placeholder="O que mudou nesta versão" />
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <History className="h-4 w-4" aria-hidden /> Histórico de versões do roteiro
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="divide-y">
                        {data.history.map((item) => (
                            <li key={item.version} className="flex items-center justify-between gap-3 py-2 text-sm">
                                <span className="min-w-0">
                                    <span className="font-medium">v{item.version}</span>
                                    {item.version === data.script.version && <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">vigente</span>}
                                    <span className="block truncate text-xs text-muted-foreground">
                                        {item.createdAt ? `${format(new Date(item.createdAt), "dd/MM/yyyy HH:mm")} · ${item.createdByName ?? item.createdBy}` : "Padrão do sistema"}
                                        {item.notes ? ` · ${item.notes}` : ""}
                                    </span>
                                </span>
                                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setViewing(item.version)}>
                                    <Eye className="h-4 w-4" aria-hidden /> Ver
                                </Button>
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>

            <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Roteiro v{viewing}</DialogTitle>
                        <DialogDescription>{version.data?.notes || "Perguntas desta versão"}</DialogDescription>
                    </DialogHeader>
                    {version.isLoading ? (
                        <Skeleton className="h-40" />
                    ) : (
                        <ol className="max-h-[60vh] space-y-2 overflow-y-auto">
                            {(version.data?.questions ?? []).map((question, index) => (
                                <li key={question.field} className="rounded-md border p-2 text-sm">
                                    <p className="font-medium">
                                        {index + 1}. {BUSINESS_FIELD_LABELS[question.field]} · {question.required ? "obrigatória" : "opcional"} · {question.active ? "ativa" : "inativa"}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{question.prompt}</p>
                                </li>
                            ))}
                        </ol>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
