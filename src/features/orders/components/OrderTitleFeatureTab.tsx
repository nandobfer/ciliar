"use client"

import { useEffect } from "react"
import { useForm, useWatch, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { usePermissions } from "@nandobfer/perfix/react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { FeatureFormShell } from "@/features/ai/components/FeatureFormShell"
import { useAiProviderStatuses } from "@/features/ai/hooks/useAi"
import { OpexModelCard } from "@/features/opex-agent/components/settings/OpexModelCard"
import type { OpexAgentSettings } from "@/features/opex-agent/schemas"
import { DEFAULT_ORDER_TITLE_INSTRUCTIONS } from "../constants"
import { DEFAULT_ORDER_TITLE_FEATURE, orderTitleFeatureSchema, type OrderTitleFeatureSettings } from "../schemas"
import { useOrderTitleSettings, useSaveOrderTitleSettings } from "../hooks/useOrders"

/**
 * Aba "Título de pedidos" de `/integracoes/ia`: provedor, modelo, variante e instruções (com
 * "Restaurar padrão") do agente que gera o título e o resumo de cada pedido em segundo plano. Ver
 * exige `integrations.ai.view`; salvar, `integrations.ai.edit`.
 */
export function OrderTitleFeatureTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useOrderTitleSettings()
    const save = useSaveOrderTitleSettings()
    const { providers } = useAiProviderStatuses()
    const { can } = usePermissions()
    const readOnly = !can("integrations.ai.edit")
    const form = useForm<OrderTitleFeatureSettings>({ resolver: zodResolver(orderTitleFeatureSchema), mode: "onChange", defaultValues: DEFAULT_ORDER_TITLE_FEATURE })
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
    if (query.isError || !query.data) return <ErrorState title="Não foi possível carregar a configuração" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    const data = query.data
    const errors = form.formState.errors

    return (
        <FeatureFormShell
            id="ai-order-title-enabled"
            label="Título de pedidos"
            description="Gera o título e o resumo de cada pedido a partir da necessidade do cliente, em segundo plano. Desligado, o título exibido é a primeira linha da descrição; o que o usuário digitar prevalece"
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
            {/* Mesmo cartão de provedor/modelo/variante do Agente Opex (o formulário tem o mesmo `main`). */}
            <OpexModelCard form={form as unknown as UseFormReturn<OpexAgentSettings>} target="main" providers={providers} title="Provedor e modelo" description="Provedores configurados na aba Provedores." />
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Instruções</CardTitle>
                    <CardDescription>O formato da resposta (título + resumo em JSON) é acrescentado pelo Ciliar.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Field id="order-title-instructions" label="Instruções" error={errors.instructions?.message}>
                        <Textarea id="order-title-instructions" rows={8} className="font-mono text-xs" disabled={readOnly} {...form.register("instructions")} />
                        {!readOnly && (
                            <div className="flex justify-end">
                                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => form.setValue("instructions", DEFAULT_ORDER_TITLE_INSTRUCTIONS, { shouldDirty: true, shouldValidate: true })}>
                                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
                                </Button>
                            </div>
                        )}
                    </Field>
                </CardContent>
            </Card>
        </FeatureFormShell>
    )
}
