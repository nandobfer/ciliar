"use client"

import { useEffect } from "react"
import { useForm, useWatch, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { usePermissions } from "@nandobfer/perfix/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ErrorState } from "@/components/feedback/ErrorState"
import { FORM_GRID } from "@/components/ui/form-grid"
import { OpexModelCard } from "@/features/opex-agent/components/settings/OpexModelCard"
import type { OpexAgentSettings } from "@/features/opex-agent/schemas"
import { DEFAULT_SUMMARY_FEATURE, summaryFeatureSchema, type SummaryFeatureSettings } from "../../schemas"
import { useAiProviderStatuses } from "../../hooks/useAi"
import { useSaveSummarySettings, useSummarySettings } from "../../hooks/useSummarySettings"
import { FeatureFormShell } from "../FeatureFormShell"

/**
 * Aba "Resumo": formata e resume as memórias de todos os agentes. Cópia do crm-marketing-campanhas;
 * o provedor/modelo usa o cartão de modelo do Ciliar. Salvar exige `integrations.ai.edit`.
 */
export function SummaryFeatureTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useSummarySettings()
    const save = useSaveSummarySettings()
    const { providers } = useAiProviderStatuses()
    const { can } = usePermissions()
    const readOnly = !can("integrations.ai.edit")
    const form = useForm<SummaryFeatureSettings>({ resolver: zodResolver(summaryFeatureSchema), mode: "onChange", defaultValues: DEFAULT_SUMMARY_FEATURE })
    const dirty = form.formState.isDirty
    const enabled = useWatch({ control: form.control, name: "enabled" })
    useEffect(() => {
        if (query.data) form.reset(query.data.settings)
    }, [query.data, form])
    useEffect(() => {
        onDirtyChange(dirty)
        return () => onDirtyChange(false)
    }, [dirty, onDirtyChange])

    if (query.isLoading) return <Skeleton className="h-96 w-full" />
    if (query.isError || !query.data) return <ErrorState title="Não foi possível carregar a configuração" onRetry={() => void query.refetch()} />
    const data = query.data
    const errors = form.formState.errors

    return (
        <FeatureFormShell
            id="ai-summary-enabled"
            label="Resumo"
            description="Revisa o texto das memórias dos agentes antes de salvar e gera o resumo de uma linha mostrado nas listas. Desligado, a memória é salva como escrita"
            enabled={enabled}
            onEnabledChange={(value) => form.setValue("enabled", value, { shouldDirty: true, shouldValidate: true })}
            availability={data.availability}
            dirty={dirty}
            isDefault={data.isDefault}
            pending={save.isPending}
            readOnly={readOnly}
            onUndo={() => form.reset(data.settings)}
            onSave={() =>
                void form.handleSubmit(async (values) => {
                    const saved = await save.mutateAsync(values).catch(() => null)
                    if (saved) form.reset(saved.settings)
                })()
            }
        >
            {/* Mesmo cartão de provedor/modelo do Agente Opex (o formulário tem o mesmo `main`). */}
            <OpexModelCard form={form as unknown as UseFormReturn<OpexAgentSettings>} target="main" providers={providers} title="Provedor e modelo" description="Provedores configurados na aba Provedores." />
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Instruções</CardTitle>
                    <CardDescription>O formato da resposta (texto revisado + resumo) é acrescentado pelo Ciliar.</CardDescription>
                </CardHeader>
                <CardContent className={FORM_GRID}>
                    <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="summary-instructions">Instruções do Resumo</Label>
                        <Textarea id="summary-instructions" rows={6} disabled={readOnly} {...form.register("instructions")} />
                        {errors.instructions?.message && <p className="text-xs text-destructive">{errors.instructions.message}</p>}
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="summary-max">Tamanho máximo do resumo (caracteres)</Label>
                        <Input id="summary-max" type="number" disabled={readOnly} {...form.register("maxLength", { valueAsNumber: true })} />
                        {errors.maxLength?.message && <p className="text-xs text-destructive">{errors.maxLength.message}</p>}
                    </div>
                </CardContent>
            </Card>
        </FeatureFormShell>
    )
}
