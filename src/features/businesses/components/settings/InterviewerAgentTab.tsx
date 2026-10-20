"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useForm, type UseFormReturn } from "react-hook-form"
import { Can, usePermissions } from "@nandobfer/perfix/react"
import { zodResolver } from "@hookform/resolvers/zod"
import { format } from "date-fns"
import { AlertTriangle, Brain, Info, ListOrdered, Loader2, RotateCcw, Save, Settings2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { ErrorState } from "@/components/feedback/ErrorState"
import { useAiProviderStatuses } from "@/features/ai/hooks/useAi"
import { apiErrorMessage } from "@/lib/api"
import { OpexModelCard } from "@/features/opex-agent/components/settings/OpexModelCard"
import type { OpexAgentSettings } from "@/features/opex-agent/schemas"
import { DEFAULT_INTERVIEWER_INSTRUCTIONS, type InterviewQuestionDef } from "../../constants"
import { DEFAULT_INTERVIEWER_SETTINGS, interviewerSettingsSchema, interviewQuestionsSchema, type InterviewerSettings } from "../../schemas"
import { useInterviewerSettings, useSaveInterviewerSettings, useSaveInterviewScript } from "../../hooks/useInterviewerSettings"
import { InterviewScriptCard } from "./InterviewScriptCard"
import { AgentMemoriesCard } from "@/features/ai/components/memories/AgentMemoriesCard"
import { AgentSettingsTabs } from "@/features/ai/components/AgentSettingsTabs"
import type { IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"

type InterviewerSection = "geral" | "roteiro" | "memorias"
const SECTIONS: IntegrationTabDef<InterviewerSection>[] = [
    { id: "geral", label: "Geral", icon: Settings2 },
    { id: "roteiro", label: "Roteiro", icon: ListOrdered },
    { id: "memorias", label: "Memórias", icon: Brain },
]

const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/**
 * Aba "Agente Entrevistador" de `/integracoes/ia`, em seções: Geral (ativo, provedor, modelo e variante
 * — mesmos provedores do Agente Opex — e instruções com "Restaurar padrão"), Roteiro (versionado, salvo
 * à parte) e Memórias (com `ai_memories.view`). Os rascunhos ficam montados acima das seções. Ver exige
 * `integrations.ai.view`; salvar, `integrations.ai.edit` (o servidor confere).
 */
export function InterviewerAgentTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useInterviewerSettings()
    const save = useSaveInterviewerSettings()
    const saveScript = useSaveInterviewScript()
    const { can } = usePermissions()
    const readOnly = !can("integrations.ai.edit")
    const { providers } = useAiProviderStatuses()
    const form = useForm<InterviewerSettings>({ resolver: zodResolver(interviewerSettingsSchema), mode: "onChange", defaultValues: DEFAULT_INTERVIEWER_SETTINGS })
    // Rascunho do roteiro: a versão é a da abertura (um refetch não promove um rascunho antigo à nova versão).
    const [scriptState, setScript] = useState<{ version: number; questions: InterviewQuestionDef[]; draft: InterviewQuestionDef[]; notes: string } | null>(null)
    const script = scriptState ?? (query.data ? { version: query.data.script.version, questions: query.data.script.questions, draft: query.data.script.questions, notes: "" } : null)
    const settingsDirty = form.formState.isDirty
    const scriptDirty = Boolean(script && (JSON.stringify(script.draft) !== JSON.stringify(script.questions) || script.notes.trim() !== ""))

    useEffect(() => {
        if (query.data) form.reset(query.data.settings)
    }, [query.data, form])
    useEffect(() => {
        onDirtyChange(settingsDirty || scriptDirty)
        return () => onDirtyChange(false)
    }, [settingsDirty, scriptDirty, onDirtyChange])

    if (query.isLoading || !script) return query.isError ? <ErrorState title="Não foi possível carregar a configuração" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} /> : <Skeleton className="h-96 w-full" />
    if (query.isError || !query.data) return <ErrorState title="Não foi possível carregar a configuração" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />

    const data = query.data
    const availability = data.availability
    const errors = form.formState.errors
    const submit = form.handleSubmit(async (values) => {
        const saved = await save.mutateAsync(values).catch(() => null)
        if (saved) form.reset(saved.settings)
    })
    const submitScript = async () => {
        const saved = await saveScript.mutateAsync({ questions: script.draft, notes: script.notes, version: script.version }).catch(() => null)
        if (saved) setScript({ version: saved.script.version, questions: saved.script.questions, draft: saved.script.questions, notes: "" })
    }
    const outdated = data.script.version !== script.version
    const tabs = SECTIONS.filter((section) => section.id !== "memorias" || can("ai_memories.view"))

    return (
        <AgentSettingsTabs<InterviewerSection> tabs={tabs} fallback="geral" label="Seções do Agente Entrevistador">
            {(section) => (
                <>
                    {section === "geral" && (
                        <>
                            <Card>
                                <CardContent className="space-y-3 pt-6">
                                    <FormToggleCard<InterviewerSettings>
                                        control={form.control}
                                        name="enabled"
                                        id="interviewer-enabled"
                                        label="Agente Entrevistador"
                                        description="Conduz a entrevista que cria cada novo negócio (/negocios/novo), seguindo o roteiro. Sem ele disponível, a criação de negócios fica bloqueada (sem formulário de contingência)."
                                    />
                                    <AnimatePresence initial={false}>
                                        {!settingsDirty && !availability.available && availability.reason && (
                                            <motion.p key="availability" {...noticeMotion} className="flex items-start gap-2 overflow-hidden text-xs text-muted-foreground">
                                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {availability.reason}
                                            </motion.p>
                                        )}
                                    </AnimatePresence>
                                    {data.lastUnavailableAt && !availability.available && (
                                        <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning" role="alert">
                                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                            Usuários foram bloqueados na criação de negócios em {format(new Date(data.lastUnavailableAt), "dd/MM/yyyy HH:mm")}
                                            {data.lastUnavailableReason ? `: ${data.lastUnavailableReason}` : ""}. Quem pode configurar recebe um e-mail (no máximo um por hora, com SMTP).
                                        </p>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Mesmo cartão de provedor/modelo/variante do Agente Opex (o formulário tem o mesmo `main`). */}
                            <OpexModelCard form={form as unknown as UseFormReturn<OpexAgentSettings>} target="main" providers={providers} title="Modelo do entrevistador" description="Modelo que conduz a entrevista e grava as respostas com as ferramentas do roteiro." />

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Instruções</CardTitle>
                                    <CardDescription>Prompt de sistema do entrevistador. O roteiro, a situação de cada pergunta e a data/hora entram sozinhos a cada turno.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Field id="interviewer-instructions" label="Instruções" error={errors.instructions?.message}>
                                        <Textarea id="interviewer-instructions" rows={12} className="font-mono text-xs" disabled={readOnly} {...form.register("instructions")} />
                                        {!readOnly && (
                                            <div className="flex justify-end">
                                                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => form.setValue("instructions", DEFAULT_INTERVIEWER_INSTRUCTIONS, { shouldDirty: true, shouldValidate: true })}>
                                                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
                                                </Button>
                                            </div>
                                        )}
                                    </Field>
                                </CardContent>
                            </Card>

                            <Can permission="integrations.ai.edit">
                                <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
                                    <Button type="button" variant="outline" className="gap-1.5" disabled={!settingsDirty || save.isPending} onClick={() => form.reset(data.settings)}>
                                        <Undo2 className="h-4 w-4" aria-hidden /> Desfazer
                                    </Button>
                                    <Button type="button" className="gap-1.5" disabled={(!settingsDirty && !data.isDefault) || save.isPending} onClick={() => void submit()}>
                                        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                                        Salvar configuração
                                    </Button>
                                </div>
                            </Can>
                        </>
                    )}
                    {section === "roteiro" && (
                        <>
                            <InterviewScriptCard
                                data={data}
                                draft={script.draft}
                                onChange={(draft) => setScript({ ...script, draft })}
                                notes={script.notes}
                                onNotesChange={(notes) => setScript({ ...script, notes })}
                                readOnly={readOnly}
                            />
                            {outdated && <p className="text-xs text-warning">Outra pessoa salvou a versão v{data.script.version} do roteiro. Desfaça para carregá-la; salvar este rascunho será recusado.</p>}

                            <Can permission="integrations.ai.edit">
                                <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
                                    <Button type="button" variant="outline" className="gap-1.5" disabled={(!scriptDirty && !outdated) || saveScript.isPending} onClick={() => setScript({ version: data.script.version, questions: data.script.questions, draft: data.script.questions, notes: "" })}>
                                        <Undo2 className="h-4 w-4" aria-hidden /> Desfazer roteiro
                                    </Button>
                                    <Button type="button" className="gap-1.5" disabled={!scriptDirty || saveScript.isPending || !interviewQuestionsSchema.safeParse(script.draft).success} onClick={() => void submitScript()}>
                                        {saveScript.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                                        Salvar nova versão do roteiro
                                    </Button>
                                </div>
                            </Can>
                        </>
                    )}
                    {section === "memorias" && <AgentMemoriesCard agentId="business-interviewer" />}
                </>
            )}
        </AgentSettingsTabs>
    )
}
