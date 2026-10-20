"use client"

import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RoleChip } from "@/features/access/components/permissions/RoleChip"
import {
    DOCUMENT_TYPE_CATEGORIES,
    DOCUMENT_TYPE_LABELS,
    MAX_DOCUMENT_MAX_MB,
    MAX_RETENTION_DAYS,
    MIN_DOCUMENT_MAX_MB,
    MIN_RETENTION_DAYS,
    RETENTION_TYPE_LABELS,
    RETENTION_TYPES,
} from "../constants"
import type { PlatformSettings } from "../schemas"
import type { DefaultRoleOption, SignupAvailability } from "../types"

const NONE = "__none__"

type Form = UseFormReturn<PlatformSettings>

/** Aba "Cadastro": perfil padrão do cadastro público e a situação (falha fechado). */
export function SignupSection({ form, options, signup, readOnly }: { form: Form; options: DefaultRoleOption[]; signup: SignupAvailability; readOnly: boolean }) {
    const dirty = form.formState.dirtyFields.defaultRoleId
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Cadastro público</CardTitle>
                <CardDescription>
                    Qualquer pessoa com conta Google pode se cadastrar e recebe o perfil padrão. Convites (pré-cadastros em Usuários) recebem os perfis escolhidos no convite.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Field id="platform-default-role" label="Perfil padrão" error={form.formState.errors.defaultRoleId?.message}>
                    <Controller
                        control={form.control}
                        name="defaultRoleId"
                        render={({ field }) => (
                            <Select
                                value={field.value ?? NONE}
                                // O `<select>` nativo oculto do Radix (dentro de `<form>`) emite "" quando o valor muda
                                // por `reset`; ignorar evita apagar o perfil salvo ("ID inválido").
                                onValueChange={(value) => { if (value) field.onChange(value === NONE ? null : value) }}
                                disabled={readOnly}
                            >
                                <SelectTrigger id="platform-default-role" aria-label="Perfil padrão">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>Nenhum (cadastro público desativado)</SelectItem>
                                    {options.map((option) => (
                                        <SelectItem key={option.id} value={option.id} disabled={option.bloqueado && option.id !== field.value}>
                                            <span className="inline-flex items-center gap-2">
                                                <RoleChip cargo={option} />
                                                {option.motivo && <span className="text-xs text-muted-foreground">{option.motivo}</span>}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    />
                </Field>
                <p className="text-xs text-muted-foreground">O Administrador nunca pode ser o perfil padrão. Enquanto for o padrão, o perfil não pode ser inativado nem excluído.</p>
                {!dirty && (
                    <p className={`flex items-start gap-2 text-sm ${signup.available ? "text-success" : "text-warning"}`} role="status">
                        {signup.available ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
                        {signup.available ? "Cadastro público disponível." : signup.message}
                    </p>
                )}
            </CardContent>
        </Card>
    )
}

/** Aba "Retenção": dias até a exclusão definitiva de itens arquivados, por tipo. */
export function RetentionSection({ form, readOnly }: { form: Form; readOnly: boolean }) {
    const errors = form.formState.errors.retentionDays
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Exclusão definitiva de arquivados</CardTitle>
                <CardDescription>
                    Dias que um item arquivado fica disponível para restauração antes de ser excluído definitivamente ({MIN_RETENTION_DAYS} a {MAX_RETENTION_DAYS}).
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
                {RETENTION_TYPES.map((type) => (
                    <Field key={type} id={`retention-${type}`} label={RETENTION_TYPE_LABELS[type]} error={errors?.[type]?.message}>
                        <div className="flex items-center gap-2">
                            <Input
                                id={`retention-${type}`}
                                type="number"
                                inputMode="numeric"
                                min={MIN_RETENTION_DAYS}
                                max={MAX_RETENTION_DAYS}
                                disabled={readOnly}
                                {...form.register(`retentionDays.${type}`, { valueAsNumber: true })}
                            />
                            <span className="text-sm text-muted-foreground">dias</span>
                        </div>
                    </Field>
                ))}
            </CardContent>
        </Card>
    )
}

/** Aba "Documentos": tamanho máximo e tipos aceitos em documentos/anexos (M2). */
export function DocumentsSection({ form, readOnly }: { form: Form; readOnly: boolean }) {
    const allowed = useWatch({ control: form.control, name: "documents.allowedTypes" }) ?? []
    const errors = form.formState.errors.documents
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Documentos e anexos</CardTitle>
                <CardDescription>Limites aplicados a todo upload de documento ou anexo. Sem limite de quantidade.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <Field id="documents-max-size" label="Tamanho máximo por arquivo" error={errors?.maxFileSizeMb?.message}>
                    <div className="flex max-w-xs items-center gap-2">
                        <Input
                            id="documents-max-size"
                            type="number"
                            inputMode="numeric"
                            min={MIN_DOCUMENT_MAX_MB}
                            max={MAX_DOCUMENT_MAX_MB}
                            disabled={readOnly}
                            {...form.register("documents.maxFileSizeMb", { valueAsNumber: true })}
                        />
                        <span className="text-sm text-muted-foreground">MB</span>
                    </div>
                </Field>
                <fieldset className="space-y-2">
                    <legend className="mb-2 text-sm font-medium">Tipos permitidos</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {DOCUMENT_TYPE_CATEGORIES.map((category) => (
                            <label key={category} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                                <Checkbox
                                    checked={allowed.includes(category)}
                                    disabled={readOnly}
                                    onCheckedChange={(checked) =>
                                        form.setValue("documents.allowedTypes", checked ? [...allowed, category] : allowed.filter((value) => value !== category), { shouldDirty: true, shouldValidate: true })
                                    }
                                />
                                <span>
                                    <span className="font-medium">{DOCUMENT_TYPE_LABELS[category].label}</span>
                                    <span className="block text-xs text-muted-foreground">{DOCUMENT_TYPE_LABELS[category].description}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                    {errors?.allowedTypes?.message && <p role="alert" className="text-sm text-destructive">{errors.allowedTypes.message}</p>}
                </fieldset>
            </CardContent>
        </Card>
    )
}
