"use client"

import { useMemo } from "react"
import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { OptionTabs } from "@/components/ui/option-tabs"
import { cn } from "@/lib/utils"
import { PermissionTree } from "@/features/access/components/permissions/PermissionTree"
import { OPEX_CONFIRMATION_POLICIES, OPEX_CONFIRMATION_POLICY_LABELS, type OpexConfirmationPolicy } from "../../constants"
import type { OpexAgentSettings } from "../../schemas"
import {
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
    destructive: { label: "Sempre confirma", className: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
}

/** Risco, permissões exigidas e "sempre ligada" ao lado do nome de cada ferramenta. */
function ToolLeafMeta({ name }: { name: string }) {
    const meta = opexToolMeta(name)
    if (!meta) return null
    const permission = opexToolPermissionLabel(meta)
    const badge = RISK_BADGES[meta.risk]
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
        </span>
    )
}

const renderLeafMeta = (key: string) => <ToolLeafMeta name={key} />

/**
 * Ferramentas liberadas ao agente, no mesmo formato das permissões dos perfis: um módulo por grupo,
 * caixa "todas" por grupo, busca e contador. A configuração guarda as **desligadas** (ferramenta nova
 * nasce ligada). Mesmo ligada, cada ferramenta só entra no turno de quem tem as permissões exigidas.
 */
export function OpexToolsCard({ form }: { form: UseFormReturn<OpexAgentSettings>; toolCounts?: Record<string, number> }) {
    const disabledTools = useWatch({ control: form.control, name: "disabledTools" })
    const selected = useMemo(() => new Set(enabledOpexToolNames(disabledTools ?? [])), [disabledTools])
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
                    <p className="text-xs text-muted-foreground">Ações destrutivas (excluir, desativar, alterar perfis e permissões, gravar integração, gerar ou revogar token…) sempre mostram Confirmar/Cancelar no chat.</p>
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
