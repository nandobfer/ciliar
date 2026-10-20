"use client"

import { useMemo } from "react"
import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { OptionTabs } from "@/components/ui/option-tabs"
import { cn } from "@/lib/utils"
import { AlertTriangle } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { PermissionTree } from "@/features/access/components/permissions/PermissionTree"
import { OPEX_CONFIRMATION_POLICIES, OPEX_CONFIRMATION_POLICY_LABELS, type OpexConfirmationPolicy } from "../../constants"
import type { OpexAgentSettings } from "../../schemas"
import {
    defaultToolConfirms,
    toolConfirms,
    disabledOpexToolNames,
    enabledOpexToolNames,
    OPEX_ALWAYS_ON_TOOLS,
    OPEX_TOOL_TREE,
    opexToolMeta,
    opexToolPermissionLabel,
    opexToolTreeCatalog,
    type OpexToolRisk,
} from "../../tool-catalog"

const RISK_BADGES: Record<OpexToolRisk, { label: string; className: string }> = {
    read: { label: "Leitura", className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
    write: { label: "Altera", className: "bg-primary/10 text-primary" },
    destructive: { label: "Destrutiva", className: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
}

interface ConfirmationControl {
    policy: OpexConfirmationPolicy
    overrides: Readonly<Record<string, boolean>>
    onChange: (name: string, confirms: boolean) => void
}

/** Risco, permissões exigidas, "sempre ligada" e se pede confirmação, ao lado do nome de cada ferramenta. */
function ToolLeafMeta({ name, confirmation }: { name: string; confirmation: ConfirmationControl }) {
    const meta = opexToolMeta(name)
    if (!meta) return null
    const permission = opexToolPermissionLabel(meta)
    const badge = RISK_BADGES[meta.risk]
    const confirms = toolConfirms(meta, confirmation.policy, confirmation.overrides)
    const custom = confirms !== defaultToolConfirms(meta.risk, confirmation.policy)
    const id = `opex-confirm-${meta.name}`
    return (
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <code className="text-[10px] text-muted-foreground">{meta.name}</code>
            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", badge.className)}>{badge.label}</span>
            {meta.alwaysOn && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Sempre ligada</span>}
            {permission && (
                <span className="rounded-full border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground" title="Permissão exigida do usuário">
                    {permission}
                </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                <Switch id={id} checked={confirms} onCheckedChange={(value) => confirmation.onChange(meta.name, value)} className="scale-75" aria-label={`${meta.label}: pede confirmação`} />
                <label htmlFor={id} className="cursor-pointer">
                    Pede confirmação
                </label>
                {custom && <span className="font-semibold text-primary">· personalizado</span>}
            </span>
            {meta.risk === "destructive" && !confirms && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-warning" role="note">
                    <AlertTriangle className="h-3 w-3" aria-hidden /> Ação destrutiva sem confirmação
                </span>
            )}
        </span>
    )
}

/**
 * Ferramentas liberadas ao agente, no mesmo formato das permissões dos perfis: um módulo por grupo,
 * caixa "todas" por grupo, busca e contador. A configuração guarda as **desligadas** (ferramenta nova
 * nasce ligada). Mesmo ligada, cada ferramenta só entra no turno de quem tem as permissões exigidas.
 */
export function OpexToolsCard({ form }: { form: UseFormReturn<OpexAgentSettings>; toolCounts?: Record<string, number> }) {
    const disabledTools = useWatch({ control: form.control, name: "disabledTools" })
    const selected = useMemo(() => new Set(enabledOpexToolNames(disabledTools ?? [])), [disabledTools])
    const policy = useWatch({ control: form.control, name: "confirmation" })
    const overrides = useWatch({ control: form.control, name: "confirmationOverrides" })
    const renderLeafMeta = (key: string) => (
        <ToolLeafMeta
            name={key}
            confirmation={{
                policy,
                overrides: overrides ?? {},
                onChange: (name, confirms) => {
                    const meta = opexToolMeta(name)!
                    const next = { ...(overrides ?? {}) }
                    // Igual ao padrão do risco: some o ajuste (a política geral volta a valer).
                    if (confirms === defaultToolConfirms(meta.risk, policy)) delete next[name]
                    else next[name] = confirms
                    form.setValue("confirmationOverrides", next, { shouldDirty: true, shouldValidate: true })
                },
            }}
        />
    )
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Ferramentas</CardTitle>
                <CardDescription>
                    O agente usa quantas ferramentas precisar, sem limite de chamadas. Desmarque as que ele não deve usar. Cada ferramenta ainda exige as permissões do usuário que conversa (inclusive em
                    &quot;Visualizar como&quot;), conferidas antes de cada execução.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <Field id="opex-confirmation" label="Pedir confirmação antes de executar">
                    <Controller
                        control={form.control}
                        name="confirmation"
                        render={({ field }) => (
                            <OptionTabs<OpexConfirmationPolicy>
                                id="opex-confirmation"
                                options={OPEX_CONFIRMATION_POLICIES.map((value) => ({ value, label: OPEX_CONFIRMATION_POLICY_LABELS[value] }))}
                                value={field.value}
                                onChange={field.onChange}
                                className="w-full"
                            />
                        )}
                    />
                    <p className="text-xs text-muted-foreground">
                        Padrão de cada ferramenta: as destrutivas (excluir, desativar, alterar perfis e permissões, gravar integração, gerar ou revogar token…) mostram Confirmar/Cancelar no chat; as que alteram, só em &quot;Toda alteração&quot;. Em cada ferramenta abaixo, &quot;Pede confirmação&quot; troca o padrão.
                    </p>
                </Field>
                <PermissionTree
                    tree={OPEX_TOOL_TREE}
                    catalog={opexToolTreeCatalog}
                    selected={selected}
                    lockedKeys={OPEX_ALWAYS_ON_TOOLS}
                    renderLeafMeta={renderLeafMeta}
                    searchPlaceholder="Buscar ferramenta..."
                    emptyText="Nenhuma ferramenta encontrada."
                    onChange={(next) => form.setValue("disabledTools", disabledOpexToolNames(next), { shouldDirty: true, shouldValidate: true })}
                />
            </CardContent>
        </Card>
    )
}
