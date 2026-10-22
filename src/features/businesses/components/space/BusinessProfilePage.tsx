"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { AlertTriangle, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { withBasePath } from "@/lib/base-path"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FormFooter } from "@/components/ui/form-footer"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import {
    BUSINESS_DESCRIPTION_MAX,
    BUSINESS_THEME_MODE_LABELS,
    BUSINESS_THEME_MODES,
    BUSINESS_TYPE_LABELS,
    BUSINESS_TYPES,
    BUSINESS_LOGO_MIMES,
    CURRENCIES,
    DEFAULT_BUSINESS_PRIMARY,
    type BusinessThemeMode,
    type BusinessType,
    type Currency,
} from "../../constants"
import { businessUpdateSchema } from "../../schemas"
import { isHexColor, resolveTheme } from "../../theme"
import type { BusinessDetailDto } from "../../types"
import { useBusinessLogo, useBusinessUploads, useUpdateBusiness } from "../../hooks/useBusinessSpace"
import { AvailabilityControl, LinksControl } from "../interview/InterviewAnswerControl"
import { LogoDropzone } from "../LogoDropzone"
import { useBusinessSpace } from "./BusinessSpaceLayout"
import { setThemePreview } from "./theme-preview"

interface Draft {
    name: string
    type: BusinessType | "none"
    subtype: string
    segment: string
    description: string
    links: string[]
    availability: { weekday: number; start: string; end: string }[]
    currency: Currency
    contactEmail: string
    contactPhone: string
    deadlineAlertDays: string
    quoteValidityDays: string
    primaryColor: string
    mode: BusinessThemeMode
}

function draftOf(business: BusinessDetailDto): Draft {
    return {
        name: business.name,
        type: business.type ?? "none",
        subtype: business.subtype ?? "",
        segment: business.segment ?? "",
        description: business.description ?? "",
        links: business.links.length ? [...business.links] : [""],
        availability: business.availability.map((day) => ({ weekday: day.weekday, start: day.start ?? "", end: day.end ?? "" })),
        currency: business.currency,
        contactEmail: business.contactEmail ?? "",
        contactPhone: business.contactPhone ?? "",
        deadlineAlertDays: String(business.deadlineAlertDays),
        quoteValidityDays: String(business.quoteValidityDays),
        primaryColor: business.theme.primaryColor,
        mode: business.theme.mode,
    }
}

/** Valores no formato da API (para comparar com o salvo e montar só o que mudou). */
function valuesOf(draft: Draft) {
    return {
        name: draft.name.trim(),
        type: draft.type === "none" ? null : draft.type,
        subtype: draft.subtype.trim() || null,
        segment: draft.segment.trim() || null,
        description: draft.description.trim() || null,
        links: draft.links.map((link) => link.trim()).filter(Boolean),
        availability: draft.availability.map((day) => ({ weekday: day.weekday, start: day.start || null, end: day.end || null })),
        currency: draft.currency,
        contactEmail: draft.contactEmail.trim() || null,
        contactPhone: draft.contactPhone.trim() || null,
        deadlineAlertDays: draft.deadlineAlertDays.trim() === "" ? Number.NaN : Number(draft.deadlineAlertDays),
        quoteValidityDays: draft.quoteValidityDays.trim() === "" ? Number.NaN : Number(draft.quoteValidityDays),
        theme: { primaryColor: draft.primaryColor.trim().toUpperCase(), mode: draft.mode },
    }
}

type Values = ReturnType<typeof valuesOf>

function Section({ title, description, className, children }: { title: string; description?: string; className?: string; children: ReactNode }) {
    return (
        <Card className={className}>
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-4">{children}</CardContent>
        </Card>
    )
}

/** Ficha do negócio (formulário) com o tema e a pré-visualização ao vivo. */
export function BusinessProfilePage() {
    const { business } = useBusinessSpace()
    // Ficha, logo e tema: `businesses.edit` (os demais módulos têm a própria edição).
    const editable = business.actions.edit
    const save = useUpdateBusiness(business.id)
    const logo = useBusinessLogo(business.id)
    const logoUploads = useBusinessUploads(business.id, "logo")
    const [localPreview, setLocalPreview] = useState<string | null>(null)
    const [logoError, setLogoError] = useState<string | null>(null)
    // `base`: a versão da ficha em que o rascunho se apoia (salvar envia essa versão: conflito vira 409).
    const [base, setBase] = useState(business)
    const [draft, setDraft] = useState<Draft>(() => draftOf(business))
    const [errors, setErrors] = useState<Partial<Record<keyof Values | "form", string>>>({})
    const saved = useMemo(() => valuesOf(draftOf(base)), [base])
    const current = valuesOf(draft)
    const changed = (Object.keys(current) as (keyof Values)[]).filter((key) => JSON.stringify(current[key]) !== JSON.stringify(saved[key]))
    const dirty = changed.length > 0

    // Outra aba ou o agente salvou: sem alterações locais, o rascunho acompanha a versão nova.
    if (business.version !== base.version && !dirty) {
        setBase(business)
        setDraft(draftOf(business))
    }

    // Pré-visualização do tema em todo o espaço enquanto edita.
    useEffect(() => {
        setThemePreview(isHexColor(draft.primaryColor) ? { businessId: business.id, theme: { primaryColor: draft.primaryColor, mode: draft.mode } } : null)
    }, [business.id, draft.primaryColor, draft.mode])
    useEffect(() => () => setThemePreview(null), [])

    useEffect(() => {
        const handler = (event: BeforeUnloadEvent) => {
            if (!dirty) return
            event.preventDefault()
            event.returnValue = ""
        }
        window.addEventListener("beforeunload", handler)
        return () => window.removeEventListener("beforeunload", handler)
    }, [dirty])

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((previous) => ({ ...previous, [key]: value }))
    const disabled = !editable || save.isPending
    const theme = resolveTheme({ primaryColor: draft.primaryColor, mode: draft.mode })
    const validColor = isHexColor(draft.primaryColor)

    const submit = async () => {
        const patch = Object.fromEntries(changed.map((key) => [key, current[key]]))
        const parsed = businessUpdateSchema.safeParse({ ...patch, version: base.version })
        if (!parsed.success) {
            const issue = parsed.error.issues[0]!
            const field = String(issue.path[0] ?? "form") as keyof Values
            setErrors({ [field]: issue.message })
            toast.error(issue.message)
            return
        }
        setErrors({})
        try {
            const detail = await save.mutateAsync(parsed.data)
            setBase(detail)
            setDraft(draftOf(detail))
        } catch {
            /* conserva o rascunho */
        }
    }

    const onLogoFile = async (file: File | undefined) => {
        if (!file) return
        setLogoError(null)
        const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : null
        setLocalPreview(preview)
        try {
            const uploaded = await logoUploads.upload(file)
            if (!uploaded.file) {
                setLogoError(uploaded.error ?? "Não foi possível enviar a imagem")
                return
            }
            await logo.set.mutateAsync(uploaded.file.id).catch(() => setLogoError("Não foi possível trocar a logo"))
        } finally {
            logoUploads.reset()
            setLocalPreview(null)
            if (preview) URL.revokeObjectURL(preview)
        }
    }

    const logoBusy = logoUploads.busy || logo.set.isPending || logo.remove.isPending
    const uploadItem = logoUploads.items[0] ?? null
    const currencyChanged = draft.currency !== business.currency
    const valued = business.valuedItems.activities + business.valuedItems.goals

    return (
        <>
            <CadastroHeader title="Ficha do negócio" description={editable ? "Dados do negócio, contato comercial, prazos e tema" : "Somente leitura"} />
            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <Section title="Identificação" className="h-full">
                    <div className={FORM_GRID}>
                        <Field id="business-name" label="Nome" error={errors.name}>
                            <Input id="business-name" value={draft.name} maxLength={120} placeholder={`Negócio ${business.number}`} disabled={disabled} onChange={(event) => set("name", event.target.value)} />
                        </Field>
                        <Field id="business-type" label="Tipo">
                            <Select value={draft.type} onValueChange={(value) => set("type", value as Draft["type"])} disabled={disabled}>
                                <SelectTrigger id="business-type">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Não informado</SelectItem>
                                    {BUSINESS_TYPES.map((type) => (
                                        <SelectItem key={type} value={type}>
                                            {type} — {BUSINESS_TYPE_LABELS[type]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field id="business-subtype" label="Subtipo (MEI, ME, EPP, autônomo…)" error={errors.subtype}>
                            <Input id="business-subtype" value={draft.subtype} maxLength={60} disabled={disabled} onChange={(event) => set("subtype", event.target.value)} />
                        </Field>
                        <Field id="business-segment" label="Área/segmento" error={errors.segment}>
                            <Input id="business-segment" value={draft.segment} maxLength={120} disabled={disabled} onChange={(event) => set("segment", event.target.value)} />
                        </Field>
                    </div>
                    <p className="text-xs text-muted-foreground">Nome vazio volta ao nome automático &quot;Negócio {business.number}&quot;.</p>
                </Section>

                <Section title="Logo/foto" className="h-full">
                    <LogoDropzone
                        previewUrl={localPreview ?? (business.logo ? withBasePath(business.logo.url) : null)}
                        name={uploadItem?.name ?? (business.logo ? business.logo.name : null)}
                        hint="PNG, JPEG, WebP ou GIF · até o tamanho máximo de arquivos da Plataforma"
                        accept={BUSINESS_LOGO_MIMES}
                        uploading={logoBusy && Boolean(uploadItem || logo.set.isPending)}
                        progress={uploadItem?.progress ?? 100}
                        error={logoError}
                        disabled={!editable || logo.remove.isPending}
                        onFiles={(files) => void onLogoFile(files[0])}
                    />
                    {editable && business.logo && (
                        <div className="flex justify-center">
                            <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" disabled={logoBusy} onClick={() => logo.remove.mutate()}>
                                {logo.remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />} Remover
                            </Button>
                        </div>
                    )}
                </Section>
            </div>

            <Section title="Descrição/apresentação">
                <Field id="business-description" label="Descrição" error={errors.description}>
                    <Textarea id="business-description" rows={5} value={draft.description} maxLength={BUSINESS_DESCRIPTION_MAX} disabled={disabled} onChange={(event) => set("description", event.target.value)} />
                </Field>
            </Section>

            <Section title="Site e redes">
                <LinksControl draft={draft.links} onChange={(links) => set("links", links)} disabled={disabled} autoFocus={false} />
                {errors.links && <p role="alert" className="text-xs text-destructive">{errors.links}</p>}
            </Section>

            <Section title="Disponibilidade" description="Dias da semana e, opcionalmente, a janela de horário de cada dia.">
                <AvailabilityControl draft={draft.availability} onChange={(availability) => set("availability", availability)} disabled={disabled} />
                {errors.availability && <p role="alert" className="text-xs text-destructive">{errors.availability}</p>}
            </Section>

            <Section title="Moeda">
                <Field id="business-currency" label="Moeda dos valores (atividades, metas, pedidos)">
                    <Select value={draft.currency} onValueChange={(value) => set("currency", value as Currency)} disabled={disabled || business.currencyLocked}>
                        <SelectTrigger id="business-currency" className="max-w-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {CURRENCIES.map((currency) => (
                                <SelectItem key={currency} value={currency}>
                                    {currency}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
                {business.currencyLocked && <p className="text-xs text-muted-foreground">A moeda não pode mais ser trocada: o negócio já tem pedidos ou trabalhos.</p>}
                {currencyChanged && (
                    <Alert>
                        <AlertTriangle className="h-4 w-4" aria-hidden />
                        <AlertDescription>
                            Os valores já cadastrados não são convertidos{valued ? ` (${business.valuedItems.activities} atividade(s) e ${business.valuedItems.goals} meta(s))` : ""}: os números continuam os mesmos, agora em {draft.currency}.
                        </AlertDescription>
                    </Alert>
                )}
            </Section>

            <Section title="Contato comercial" description="Exibido no link do orçamento. Sem e-mail, vale o e-mail da conta.">
                <div className={FORM_GRID}>
                    <Field id="business-email" label="E-mail" error={errors.contactEmail}>
                        <Input id="business-email" type="email" value={draft.contactEmail} placeholder={business.accountEmail ?? ""} disabled={disabled} onChange={(event) => set("contactEmail", event.target.value)} />
                    </Field>
                    <Field id="business-phone" label="Telefone" error={errors.contactPhone}>
                        <Input id="business-phone" type="tel" value={draft.contactPhone} maxLength={30} disabled={disabled} onChange={(event) => set("contactPhone", event.target.value)} />
                    </Field>
                </div>
            </Section>

            <Section title="Prazos dos pedidos">
                <div className={FORM_GRID}>
                    <Field id="business-alert" label="Antecedência do alerta de prazo (dias)" error={errors.deadlineAlertDays}>
                        <Input id="business-alert" type="number" min={0} max={365} value={draft.deadlineAlertDays} disabled={disabled} onChange={(event) => set("deadlineAlertDays", event.target.value)} />
                    </Field>
                    <Field id="business-validity" label="Validade padrão do link do orçamento (dias)" error={errors.quoteValidityDays}>
                        <Input id="business-validity" type="number" min={1} max={365} value={draft.quoteValidityDays} disabled={disabled} onChange={(event) => set("quoteValidityDays", event.target.value)} />
                    </Field>
                </div>
            </Section>

            <Section title="Tema" description="Cor primária e modo do espaço do negócio, do portfólio, do link do orçamento e dos e-mails do negócio.">
                <div className={FORM_GRID}>
                    <Field id="business-color" label="Cor primária" error={errors.theme ?? (validColor ? undefined : "Cor no formato #RRGGBB")}>
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                aria-label="Escolher a cor primária"
                                value={validColor ? draft.primaryColor : DEFAULT_BUSINESS_PRIMARY}
                                disabled={disabled}
                                onChange={(event) => set("primaryColor", event.target.value.toUpperCase())}
                                className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent p-1 disabled:cursor-not-allowed"
                            />
                            <Input id="business-color" value={draft.primaryColor} maxLength={7} disabled={disabled} onChange={(event) => set("primaryColor", event.target.value)} className="max-w-32 font-mono uppercase" />
                            {editable && draft.primaryColor.toUpperCase() !== DEFAULT_BUSINESS_PRIMARY && (
                                <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => set("primaryColor", DEFAULT_BUSINESS_PRIMARY)}>
                                    Cor padrão
                                </Button>
                            )}
                        </div>
                    </Field>
                    <Field id="business-mode" label="Modo">
                        <OptionTabs<BusinessThemeMode> id="business-mode" aria-label="Modo do tema" options={BUSINESS_THEME_MODES.map((mode) => ({ value: mode, label: BUSINESS_THEME_MODE_LABELS[mode] }))} value={draft.mode} onChange={(mode) => set("mode", mode)} disabled={disabled} />
                    </Field>
                </div>
                {validColor && theme.neutral && (
                    <Alert>
                        <AlertTriangle className="h-4 w-4" aria-hidden />
                        <AlertDescription>Essa cor não tem contraste suficiente com texto branco nem escuro (WCAG 4,5:1): o espaço usa a cor padrão do Ciliar.</AlertDescription>
                    </Alert>
                )}
                <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3" aria-label="Pré-visualização do tema">
                    <span className="text-xs text-muted-foreground">Pré-visualização (vale em todo o espaço enquanto você edita):</span>
                    <Button type="button" size="sm" tabIndex={-1}>
                        Botão primário
                    </Button>
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">Destaque</span>
                </div>
            </Section>

            {editable && (
                <FormFooter>
                    <Button type="button" variant="outline" disabled={!dirty || save.isPending} onClick={() => { setBase(business); setDraft(draftOf(business)); setErrors({}) }}>
                        Descartar alterações
                    </Button>
                    <Button type="button" disabled={!dirty || save.isPending || !validColor} onClick={() => void submit()}>
                        {save.isPending ? "Salvando..." : "Salvar ficha"}
                    </Button>
                </FormFooter>
            )}
        </>
    )
}
