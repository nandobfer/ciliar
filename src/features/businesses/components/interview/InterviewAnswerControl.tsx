"use client"

import { useState, type KeyboardEvent, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight, Loader2, Plus, RotateCcw, SkipForward, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { IconAction } from "@/components/ui/icon-action"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MoneyInput } from "@/components/ui/money-input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { TimePicker } from "@/components/ui/time-picker"
import { cn } from "@/lib/utils"
import type { OpexUploadItem } from "@/features/opex-agent/hooks/useOpexUploads"
import { BUSINESS_TYPE_LABELS, BUSINESS_TYPES, CURRENCIES, INTERVIEW_IMAGE_MIMES, WEEKDAY_LABELS, type BusinessField, type Currency, type GoalMeasure, type GoalMode, type GoalPeriod } from "../../constants"
import { LogoDropzone } from "../LogoDropzone"
import { answerError, composeAnswer, draftFrom, emptyGoal, LOGO_MESSAGE, type AnswerDraft, type AnswerDrafts, type GoalDraft } from "../../interview-answers"

type TextField = Exclude<BusinessField, "logo">

export interface LogoUploads {
    items: OpexUploadItem[]
    ready: OpexUploadItem[]
    onFiles: (files: File[]) => void
    onRetry: (localId: string) => void
    onRemove: (localId: string) => void
    maxImageMb: number
}

interface InterviewAnswerControlProps {
    field: BusinessField
    /** Valor gravado (correção) para preencher o controle. */
    value: unknown
    subtype: string | null
    currency: string
    required: boolean
    disabled: boolean
    submitLabel?: string
    onSubmit: (text: string, withFiles?: boolean) => void
    onSkip?: () => void
    logo: LogoUploads
}

/** Segunda-feira primeiro (o valor continua 0 = domingo). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const SHORT_WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
const PERIOD_OPTIONS: { value: GoalPeriod; label: string }[] = [
    { value: "month", label: "Por mês" },
    { value: "year", label: "Por ano" },
    { value: "hour", label: "Por hora" },
]
const MEASURE_OPTIONS: { value: GoalMeasure; label: string }[] = [
    { value: "month", label: "No mês" },
    { value: "year", label: "No ano" },
    { value: "range", label: "Em um intervalo" },
]
const MODE_OPTIONS: { value: GoalMode; label: string }[] = [
    { value: "recurring", label: "Recorrente" },
    { value: "specific", label: "Específica" },
]

export function currencySymbol(currency: string): string {
    try {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).formatToParts(0).find((part) => part.type === "currency")?.value ?? currency
    } catch {
        return currency
    }
}

/**
 * Controle próprio da pergunta atual (ou da correção): monta a resposta em texto e envia ao
 * entrevistador como mensagem. Nada é gravado aqui: quem grava é a ferramenta do campo, no servidor.
 */
export function InterviewAnswerControl(props: InterviewAnswerControlProps) {
    if (props.field === "logo") return <LogoControl {...props} />
    return <FieldControl {...props} field={props.field} />
}

function Footer({ error, showError, required, disabled, submitDisabled = false, onSkip, onSubmit, submitLabel = "Continuar", busy = false, children }: { error: string | null; showError: boolean; required: boolean; disabled: boolean; submitDisabled?: boolean; onSkip?: () => void; onSubmit: () => void; submitLabel?: string; busy?: boolean; children?: ReactNode }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <AnimatePresence initial={false}>
                {showError && error ? (
                    <motion.p key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-destructive" role="alert">
                        {error}
                    </motion.p>
                ) : (
                    <span className="text-xs text-muted-foreground">{children}</span>
                )}
            </AnimatePresence>
            <div className="ml-auto flex gap-2">
                {!required && onSkip && (
                    <Button type="button" variant="ghost" className="gap-1.5" disabled={disabled} onClick={onSkip}>
                        <SkipForward className="h-4 w-4" aria-hidden /> Pular
                    </Button>
                )}
                <Button type="button" className="gap-1.5" disabled={disabled || submitDisabled || busy} onClick={onSubmit}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    {submitLabel} <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
            </div>
        </div>
    )
}

function FieldControl({ field, value, subtype, currency, required, disabled, submitLabel, onSubmit, onSkip }: InterviewAnswerControlProps & { field: TextField }) {
    const [draft, setDraft] = useState<AnswerDraft<TextField>>(() => draftFrom(field, value, subtype))
    const [tried, setTried] = useState(false)
    const error = answerError(field, draft)
    const submit = () => {
        setTried(true)
        if (error || disabled) return
        onSubmit(composeAnswer(field, draft, field === "goals" ? currency : undefined))
    }
    const onEnter = (event: KeyboardEvent) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            submit()
        }
    }
    const set = (next: AnswerDraft<TextField>) => setDraft(next)

    return (
        <div className="space-y-3">
            {(field === "name" || field === "segment") && (
                <Input
                    autoFocus
                    aria-label={field === "name" ? "Nome do negócio" : "Área ou segmento"}
                    placeholder={field === "name" ? "Ex.: Studio Aurora" : "Ex.: Fotografia de casamentos"}
                    className="h-12 text-base md:text-lg"
                    value={draft as string}
                    disabled={disabled}
                    onChange={(event) => set(event.target.value)}
                    onKeyDown={onEnter}
                />
            )}
            {field === "description" && <Textarea autoFocus aria-label="Descrição do negócio" rows={4} placeholder="Conte em poucas frases o que o negócio faz" value={draft as string} disabled={disabled} onChange={(event) => set(event.target.value)} />}
            {field === "type" && <TypeControl draft={draft as AnswerDrafts["type"]} onChange={set} disabled={disabled} />}
            {field === "links" && <LinksControl draft={draft as string[]} onChange={set} disabled={disabled} />}
            {field === "availability" && <AvailabilityControl draft={draft as AnswerDrafts["availability"]} onChange={set} disabled={disabled} />}
            {field === "goals" && <GoalsControl single draft={draft as GoalDraft[]} onChange={set} disabled={disabled} currency={currency} />}
            {field === "currency" && (
                <Select value={draft as Currency} onValueChange={(next) => set(next as Currency)} disabled={disabled}>
                    <SelectTrigger className="h-12 w-full max-w-xs text-base" aria-label="Moeda">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {CURRENCIES.map((code) => (
                            <SelectItem key={code} value={code}>
                                {code} · {currencySymbol(code)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
            <Footer error={error} showError={tried} required={required} disabled={disabled} onSkip={onSkip} onSubmit={submit} submitLabel={submitLabel} />
        </div>
    )
}

function TypeControl({ draft, onChange, disabled }: { draft: AnswerDrafts["type"]; onChange: (next: AnswerDrafts["type"]) => void; disabled: boolean }) {
    return (
        <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Tipo do negócio">
                {BUSINESS_TYPES.map((type) => {
                    const selected = draft.type === type
                    return (
                        <button
                            key={type}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={disabled}
                            onClick={() => onChange({ ...draft, type })}
                            className={cn("flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors", selected ? "border-primary bg-primary/10" : "hover:border-primary/50 hover:bg-muted/40", disabled && "cursor-not-allowed opacity-60")}
                        >
                            <span className="font-mono text-xs text-muted-foreground">{type}</span>
                            <span className="text-base font-semibold">{BUSINESS_TYPE_LABELS[type]}</span>
                            <span className="text-xs text-muted-foreground">{type === "PF" ? "Atua com o seu CPF (autônomo, profissional liberal…)" : "Tem CNPJ (MEI, ME, EPP…)"}</span>
                        </button>
                    )
                })}
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="interview-subtype" className="text-xs text-muted-foreground">
                    Enquadramento (opcional)
                </Label>
                <Input id="interview-subtype" placeholder={draft.type === "PJ" ? "Ex.: MEI, ME, EPP" : "Ex.: autônomo"} value={draft.subtype} disabled={disabled} onChange={(event) => onChange({ ...draft, subtype: event.target.value })} />
            </div>
        </div>
    )
}

/**
 * Lista de links. `autoFocus` (padrão, entrevista): o último campo recebe o foco ao abrir. Sem ele (Ficha),
 * nada é focado ao abrir (o navegador rolaria até o campo); só o campo criado por "Adicionar link".
 */
export function LinksControl({ draft, onChange, disabled, autoFocus = true }: { draft: string[]; onChange: (next: string[]) => void; disabled: boolean; autoFocus?: boolean }) {
    const [added, setAdded] = useState(false)
    return (
        <div className="space-y-2">
            {draft.map((link, index) => (
                <div key={index} className="flex items-center gap-2">
                    <Input
                        autoFocus={(autoFocus || added) && index === draft.length - 1}
                        aria-label={`Link ${index + 1}`}
                        placeholder="instagram.com/seunegocio"
                        value={link}
                        disabled={disabled}
                        onChange={(event) => onChange(draft.map((item, position) => (position === index ? event.target.value : item)))}
                    />
                    {draft.length > 1 && <IconAction icon={Trash2} label={`Remover link ${index + 1}`} tone="danger" onClick={() => onChange(draft.filter((_, position) => position !== index))} />}
                </div>
            ))}
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={disabled}
                onClick={() => {
                    setAdded(true)
                    onChange([...draft, ""])
                }}
            >
                <Plus className="h-4 w-4" aria-hidden /> Adicionar link
            </Button>
        </div>
    )
}

export function AvailabilityControl({ draft, onChange, disabled }: { draft: AnswerDrafts["availability"]; onChange: (next: AnswerDrafts["availability"]) => void; disabled: boolean }) {
    const byDay = new Map(draft.map((day) => [day.weekday, day]))
    const toggle = (weekday: number) => {
        if (byDay.has(weekday)) onChange(draft.filter((day) => day.weekday !== weekday))
        else {
            const template = draft[0]
            onChange([...draft, { weekday, start: template?.start ?? "", end: template?.end ?? "" }].sort((a, b) => WEEK_ORDER.indexOf(a.weekday) - WEEK_ORDER.indexOf(b.weekday)))
        }
    }
    const update = (weekday: number, patch: Partial<{ start: string; end: string }>) => onChange(draft.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)))
    const first = draft[0]
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Dias de atendimento">
                {WEEK_ORDER.map((weekday) => (
                    <button
                        key={weekday}
                        type="button"
                        aria-pressed={byDay.has(weekday)}
                        aria-label={WEEKDAY_LABELS[weekday]}
                        disabled={disabled}
                        onClick={() => toggle(weekday)}
                        className={cn("h-10 min-w-12 rounded-lg border px-3 text-sm font-medium transition-colors", byDay.has(weekday) ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50 hover:bg-muted/40")}
                    >
                        {SHORT_WEEKDAYS[weekday]}
                    </button>
                ))}
            </div>
            {draft.length > 0 && (
                <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Horário de cada dia (opcional)</p>
                    {draft.map((day) => (
                        <div key={day.weekday} className="flex flex-wrap items-center gap-2">
                            <span className="w-20 text-sm">{WEEKDAY_LABELS[day.weekday]}</span>
                            <TimePicker aria-label={`${WEEKDAY_LABELS[day.weekday]}: início`} placeholder="Início" value={day.start} onChange={(start) => update(day.weekday, { start })} disabled={disabled} className="w-32" />
                            <span className="text-muted-foreground">–</span>
                            <TimePicker aria-label={`${WEEKDAY_LABELS[day.weekday]}: fim`} placeholder="Fim" value={day.end} onChange={(end) => update(day.weekday, { end })} disabled={disabled} className="w-32" />
                            {(day.start || day.end) && <IconAction icon={X} label={`Sem horário na ${WEEKDAY_LABELS[day.weekday]}`} onClick={() => update(day.weekday, { start: "", end: "" })} />}
                        </div>
                    ))}
                    {draft.length > 1 && first && (first.start || first.end) && (
                        <Button type="button" variant="ghost" size="sm" className="gap-1.5" disabled={disabled} onClick={() => onChange(draft.map((day) => ({ ...day, start: first.start, end: first.end })))}>
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Usar o horário de {WEEKDAY_LABELS[first.weekday]} em todos
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}

/** Meta (entrevista e espaço do negócio): uma meta por negócio; `single` esconde adicionar/remover. */
export function GoalsControl({ draft, onChange, disabled, currency, single = false }: { draft: GoalDraft[]; onChange: (next: GoalDraft[]) => void; disabled: boolean; currency: string; single?: boolean }) {
    const update = (index: number, patch: Partial<GoalDraft>) => onChange(draft.map((goal, position) => (position === index ? { ...goal, ...patch } : goal)))
    const thisYear = new Date().getFullYear()
    const years = Array.from({ length: 6 }, (_, offset) => thisYear + offset)
    return (
        <div className="space-y-3">
            {draft.map((goal, index) => {
                const windowBase = goal.period === "hour" ? goal.measure : goal.period
                const [year, month] = goal.month.split("-")
                return (
                    <div key={index} className="space-y-3 rounded-xl border bg-muted/20 p-3" role="group" aria-label={`Meta ${index + 1}`}>
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="min-w-44 flex-1 space-y-1.5">
                                <Label htmlFor={`goal-${index}-value`} className="text-xs text-muted-foreground">
                                    Faturamento bruto {goal.period === "hour" ? "médio por hora" : ""}
                                </Label>
                                <MoneyInput id={`goal-${index}-value`} prefix={currencySymbol(currency)} value={goal.targetCents / 100} disabled={disabled} onChange={(next) => update(index, { targetCents: Math.round(next * 100) })} />
                            </div>
                            <OptionTabs<GoalPeriod> aria-label={`Meta ${index + 1}: período`} options={PERIOD_OPTIONS} value={goal.period} onChange={(period) => update(index, { period })} disabled={disabled} />
                            {!single && draft.length > 1 && <IconAction icon={Trash2} label={`Remover meta ${index + 1}`} tone="danger" onClick={() => onChange(draft.filter((_, position) => position !== index))} />}
                        </div>
                        {goal.period === "hour" && (
                            <div className="space-y-1.5">
                                <p className="text-xs text-muted-foreground">Medida</p>
                                <OptionTabs<GoalMeasure> aria-label={`Meta ${index + 1}: janela da meta por hora`} options={MEASURE_OPTIONS} value={goal.measure} onChange={(measure) => update(index, { measure })} disabled={disabled} />
                            </div>
                        )}
                        {windowBase !== "range" ? (
                            <div className="flex flex-wrap items-center gap-3">
                                <OptionTabs<GoalMode> aria-label={`Meta ${index + 1}: recorrência`} options={MODE_OPTIONS.map((option) => ({ ...option, label: option.value === "recurring" ? (windowBase === "month" ? "Todo mês" : "Todo ano") : windowBase === "month" ? "Um mês específico" : "Um ano específico" }))} value={goal.mode} onChange={(mode) => update(index, { mode })} disabled={disabled} />
                                {goal.mode === "specific" && windowBase === "month" && (
                                    <>
                                        <Select value={month} onValueChange={(next) => update(index, { month: `${year}-${next}` })} disabled={disabled}>
                                            <SelectTrigger className="w-36" aria-label={`Meta ${index + 1}: mês`}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {MONTHS.map((label, position) => (
                                                    <SelectItem key={label} value={String(position + 1).padStart(2, "0")}>
                                                        {label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <YearSelect label={`Meta ${index + 1}: ano do mês`} years={years} value={Number(year)} onChange={(next) => update(index, { month: `${next}-${month}` })} disabled={disabled} />
                                    </>
                                )}
                                {goal.mode === "specific" && windowBase === "year" && <YearSelect label={`Meta ${index + 1}: ano`} years={years} value={goal.year} onChange={(next) => update(index, { year: next })} disabled={disabled} />}
                            </div>
                        ) : (
                            <div className="flex flex-wrap items-center gap-2">
                                <DatePicker id={`goal-${index}-from`} placeholder="Início" value={goal.from} onChange={(from) => update(index, { from })} inputDisabled={disabled} className="w-44" />
                                <span className="text-muted-foreground">até</span>
                                <DatePicker id={`goal-${index}-to`} placeholder="Fim" value={goal.to} onChange={(to) => update(index, { to })} inputDisabled={disabled} className="w-44" />
                            </div>
                        )}
                    </div>
                )
            })}
            {!single && (
                <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={disabled} onClick={() => onChange([...draft, emptyGoal()])}>
                    <Plus className="h-4 w-4" aria-hidden /> Adicionar meta
                </Button>
            )}
        </div>
    )
}

function YearSelect({ label, years, value, onChange, disabled }: { label: string; years: number[]; value: number; onChange: (year: number) => void; disabled: boolean }) {
    const options = years.includes(value) ? years : [value, ...years]
    return (
        <Select value={String(value)} onValueChange={(next) => onChange(Number(next))} disabled={disabled}>
            <SelectTrigger className="w-28" aria-label={label}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {options.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                        {year}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

/** Logo/foto: área de soltar ou escolher a imagem (envio direto ao storage, como no chat). */
function LogoControl({ required, disabled, submitLabel, onSubmit, onSkip, logo }: InterviewAnswerControlProps) {
    const item = logo.items.at(-1) ?? null
    const uploading = item?.status === "uploading" || item?.status === "confirming"
    const ready = logo.ready.length > 0
    const error = ready ? null : item?.status === "error" ? (item.error ?? "Falha no envio") : "Escolha uma imagem"
    return (
        <div className="space-y-3">
            <LogoDropzone
                previewUrl={item?.previewUrl}
                name={item?.name}
                hint={`PNG, JPEG, WebP ou GIF · até ${logo.maxImageMb} MB`}
                accept={INTERVIEW_IMAGE_MIMES}
                uploading={uploading}
                progress={item?.progress ?? 0}
                disabled={disabled}
                onFiles={logo.onFiles}
            />
            {item && (
                <div className="flex justify-end gap-2">
                    {item.status === "error" && (
                        <Button type="button" variant="outline" size="sm" onClick={() => logo.onRetry(item.localId)}>
                            Tentar de novo
                        </Button>
                    )}
                    <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => logo.onRemove(item.localId)}>
                        <X className="h-4 w-4" aria-hidden /> Remover
                    </Button>
                </div>
            )}
            <Footer error={error} showError={item?.status === "error"} required={required} disabled={disabled} submitDisabled={!ready} busy={uploading} onSkip={onSkip} onSubmit={() => ready && onSubmit(LOGO_MESSAGE, true)} submitLabel={submitLabel} />
        </div>
    )
}
