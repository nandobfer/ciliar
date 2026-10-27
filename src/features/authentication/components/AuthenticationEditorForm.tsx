"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import { AlertTriangle, Globe, Loader2, Lock, Plus, Save, Undo2, X } from "lucide-react"
import { usePermissions } from "@nandobfer/perfix/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import type { IntegrationDef } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"
import { DetailHeader } from "@/features/integrations/components/detail/DetailHeader"
import { ACCESS_PROTOCOLS, normalizeAccessHost, type AccessProtocol } from "@/features/auth/request-origin"
import { ACCESS_PROTOCOL_LABELS, AUTH_METHOD_LABELS, AUTH_METHODS, MAX_EXTRA_HOSTS, type AuthMethod } from "../constants"
import { authSettingsSchema, DEFAULT_AUTH_SETTINGS, type AuthSettings } from "../schemas"
import { useAuthSettings, useSaveAuthSettings } from "../hooks/useAuthSettings"

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value, index) => value === b[index])
const isDirty = (draft: AuthSettings, saved: AuthSettings) =>
    !sameList(draft.methods.http, saved.methods.http) || !sameList(draft.methods.https, saved.methods.https) || !sameList(draft.extraHosts, saved.extraHosts)

/** Métodos de um protocolo: qualquer combinação, sempre ao menos um. */
function ProtocolMethods({ protocol, methods, readOnly, googleConfigured, current, onChange }: {
    protocol: AccessProtocol
    methods: AuthMethod[]
    readOnly: boolean
    googleConfigured: boolean
    current: boolean
    onChange: (methods: AuthMethod[]) => void
}) {
    const label = ACCESS_PROTOCOL_LABELS[protocol]
    const Icon = protocol === "https" ? Lock : Globe
    return (
        <fieldset className="space-y-3 rounded-lg border p-4" aria-label={label.label}>
            <legend className="sr-only">{label.label}</legend>
            <div className="flex items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                    <p className="text-sm font-medium">{label.label}{current && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Seu acesso atual</span>}</p>
                    <p className="text-xs text-muted-foreground">{label.description}</p>
                </div>
            </div>
            {AUTH_METHODS.map((method) => {
                const checked = methods.includes(method)
                const last = checked && methods.length === 1
                return (
                    <label key={method} className="flex items-start gap-3 rounded-md border p-3 text-sm">
                        <Checkbox
                            checked={checked}
                            disabled={readOnly || last}
                            aria-label={`${AUTH_METHOD_LABELS[method].label} (${protocol.toUpperCase()})`}
                            onCheckedChange={(value) => onChange(value === true ? AUTH_METHODS.filter((item) => item === method || methods.includes(item)) : methods.filter((item) => item !== method))}
                        />
                        <span className="min-w-0">
                            <span className="font-medium">{AUTH_METHOD_LABELS[method].label}</span>
                            <span className="block text-xs text-muted-foreground">{last ? "Ao menos um método precisa ficar habilitado" : AUTH_METHOD_LABELS[method].description}</span>
                        </span>
                    </label>
                )
            })}
            {methods.includes("google") && !googleConfigured && (
                <p className="flex items-start gap-2 text-xs text-warning" role="status"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />Google sem AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET no ambiente: o botão aparece desabilitado.</p>
            )}
            {protocol === "http" && methods.includes("google") && (
                <p className="flex items-start gap-2 text-xs text-muted-foreground"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />O Google só aceita retorno por HTTP em localhost; por IP ou domínio sem HTTPS, prefira e-mail e senha.</p>
            )}
        </fieldset>
    )
}

/**
 * Página "Autenticação" (`/integracoes/autenticacao`): métodos de login por protocolo de acesso
 * (HTTP e HTTPS, qualquer combinação, ao menos um) e os endereços de acesso adicionais (host sem
 * porta: todas as portas). Conflitos de versão preservam o rascunho.
 */
export function AuthenticationEditorForm({ def, data }: { def: IntegrationDef; data: IntegrationDetailDto }) {
    const { can } = usePermissions()
    const readOnly = !can("integrations.authentication.edit")
    const query = useAuthSettings()
    const save = useSaveAuthSettings()
    const [draft, setDraft] = useState<AuthSettings>(DEFAULT_AUTH_SETTINGS)
    const [hostInput, setHostInput] = useState("")
    const [hostError, setHostError] = useState<string | null>(null)
    const captured = useRef<number | null>(null)
    const saved = query.data?.settings
    const dirty = useMemo(() => !!saved && isDirty(draft, saved), [draft, saved])

    useEffect(() => {
        // Captura a versão da abertura: refetch não promove o rascunho a uma versão nova.
        if (query.data && (captured.current === null || !dirty)) {
            setDraft(query.data.settings)
            captured.current = query.data.version
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query.data])

    const addHost = () => {
        const host = normalizeAccessHost(hostInput)
        if (!host) return setHostError("Informe só o domínio ou o IP, sem http://, porta ou caminho (ex.: 217.77.3.47)")
        if (host === query.data?.canonicalHost || draft.extraHosts.includes(host)) return setHostError("Endereço já aceito")
        if (draft.extraHosts.length >= MAX_EXTRA_HOSTS) return setHostError(`No máximo ${MAX_EXTRA_HOSTS} endereços`)
        setDraft((value) => ({ ...value, extraHosts: [...value.extraHosts, host] }))
        setHostInput("")
        setHostError(null)
    }

    const submit = async () => {
        if (!query.data || captured.current === null) return
        const parsed = authSettingsSchema.safeParse(draft)
        if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? "Revise a configuração")
        const current = query.data.current
        if (current?.allowed && !sameList(parsed.data.methods[current.protocol], query.data.settings.methods[current.protocol])) {
            const labels = parsed.data.methods[current.protocol].map((method) => AUTH_METHOD_LABELS[method].label).join(" e ")
            if (!window.confirm(`Você está acessando via ${current.protocol.toUpperCase()}. Depois de salvar, o login por este protocolo oferecerá somente: ${labels}. Continuar?`)) return
        }
        const result = await save.mutateAsync({ ...parsed.data, version: captured.current }).catch(() => null)
        if (result) {
            setDraft(result.settings)
            captured.current = result.version
        }
    }

    return (
        <motion.div
            key="form"
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex min-w-0 flex-col gap-6"
        >
            <DetailHeader def={def} data={data} hasAnySecret={false} />
            {query.isLoading ? (
                <Skeleton className="h-72 w-full" />
            ) : query.isError || !query.data ? (
                <ErrorState title="Não foi possível carregar a configuração" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : (
                <form className="flex flex-col gap-6" noValidate onSubmit={(event) => { event.preventDefault(); void submit() }}>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Métodos de autenticação</CardTitle>
                            <CardDescription>
                                O /login mostra somente os métodos do protocolo pelo qual a pessoa acessa, e o servidor recusa os demais. E-mail e senha inclui o cadastro com senha (quando o cadastro público está disponível na Plataforma).
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            {ACCESS_PROTOCOLS.map((protocol) => (
                                <ProtocolMethods
                                    key={protocol}
                                    protocol={protocol}
                                    methods={draft.methods[protocol]}
                                    readOnly={readOnly}
                                    googleConfigured={query.data.googleConfigured}
                                    current={query.data.current?.allowed === true && query.data.current.protocol === protocol}
                                    onChange={(methods) => setDraft((value) => ({ ...value, methods: { ...value.methods, [protocol]: methods } }))}
                                />
                            ))}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Endereços de acesso adicionais</CardTitle>
                            <CardDescription>
                                Domínios ou IPs (sem porta: todas as portas valem) aceitos além do endereço oficial, por HTTP ou HTTPS. Fora desta lista, o login e as alterações são recusados.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <ul className="flex flex-wrap gap-2" aria-label="Endereços aceitos">
                                <li className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-3 py-1 text-xs" title="APP_ORIGIN: sempre aceito">
                                    {query.data.canonicalHost}<span className="text-muted-foreground">· oficial</span>
                                </li>
                                {draft.extraHosts.map((host) => (
                                    <li key={host} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs">
                                        {host}
                                        {!readOnly && (
                                            <button type="button" className="rounded-full p-0.5 text-muted-foreground hover:text-foreground" aria-label={`Remover ${host}`} onClick={() => setDraft((value) => ({ ...value, extraHosts: value.extraHosts.filter((item) => item !== host) }))}>
                                                <X className="h-3 w-3" aria-hidden />
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                            {!readOnly && (
                                <div className="space-y-1">
                                    <div className="flex gap-2">
                                        <Input
                                            aria-label="Novo endereço de acesso"
                                            placeholder="217.77.3.47"
                                            value={hostInput}
                                            aria-invalid={hostError ? true : undefined}
                                            onChange={(event) => { setHostInput(event.target.value); setHostError(null) }}
                                            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addHost() } }}
                                        />
                                        <Button type="button" variant="outline" className="gap-1.5" onClick={addHost} disabled={!hostInput.trim()}>
                                            <Plus className="h-4 w-4" aria-hidden /> Adicionar
                                        </Button>
                                    </div>
                                    {hostError && <p role="alert" className="text-xs text-destructive">{hostError}</p>}
                                </div>
                            )}
                            {query.data.current && (
                                <p className="text-xs text-muted-foreground">
                                    Seu acesso atual: {query.data.current.protocol.toUpperCase()} em {query.data.current.host}{query.data.current.allowed ? "" : " (endereço fora da lista)"}.
                                </p>
                            )}
                        </CardContent>
                    </Card>
                    {!readOnly && (
                        <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
                            <Button type="button" variant="outline" className="gap-1.5" disabled={!dirty || save.isPending} onClick={() => { setDraft(query.data.settings); captured.current = query.data.version; setHostError(null) }}>
                                <Undo2 className="h-4 w-4" aria-hidden /> Desfazer
                            </Button>
                            <Button type="submit" data-ctrl-enter-submit className="gap-1.5" disabled={!dirty || save.isPending}>
                                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                                Salvar
                            </Button>
                        </div>
                    )}
                </form>
            )}
        </motion.div>
    )
}
