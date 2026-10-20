"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Archive, FileText, Loader2, Save, ScrollText, Undo2, UserPlus } from "lucide-react"
import { usePermissions } from "@nandobfer/perfix/react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import type { IntegrationDef } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"
import { DetailHeader } from "@/features/integrations/components/detail/DetailHeader"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { useIntegrationTab } from "@/features/integrations/components/tabs/useIntegrationTab"
import { PLATFORM_TABS, type PlatformTab } from "../constants"
import { DEFAULT_PLATFORM_SETTINGS, platformSettingsSchema, type PlatformSettings } from "../schemas"
import { usePlatformSettings, useSavePlatformSettings } from "../hooks/usePlatform"
import { LegalTermsTab } from "./LegalTermsTab"
import { DocumentsSection, RetentionSection, SignupSection } from "./PlatformSettingsSections"

const TABS: IntegrationTabDef<PlatformTab>[] = [
    { id: "cadastro", label: "Cadastro", icon: UserPlus },
    { id: "termos", label: "Termos e privacidade", icon: ScrollText },
    { id: "retencao", label: "Retenção", icon: Archive },
    { id: "documentos", label: "Documentos", icon: FileText },
]

/**
 * Página "Plataforma" (`/integracoes/plataforma`): perfil padrão do cadastro público, termos e
 * política versionados, prazos de exclusão definitiva por tipo e limites de documentos. Trocar de
 * aba com alterações pede descarte; conflitos de versão preservam o rascunho.
 */
export function PlatformEditorForm({ def, data }: { def: IntegrationDef; data: IntegrationDetailDto }) {
    const { can } = usePermissions()
    const readOnly = !can("integrations.platform.edit")
    const query = usePlatformSettings()
    const save = useSavePlatformSettings()
    const form = useForm<PlatformSettings>({ resolver: zodResolver(platformSettingsSchema), mode: "onChange", defaultValues: DEFAULT_PLATFORM_SETTINGS })
    const dirty = form.formState.isDirty
    const [legalDirty, setLegalDirty] = useState(false)
    const [legalKey, setLegalKey] = useState(0)
    const captured = useRef<number | null>(null)
    const setCaptured = (value: number) => { captured.current = value }

    useEffect(() => {
        // Captura a versão da abertura: refetch não promove o rascunho a uma versão nova.
        if (query.data && !form.formState.isDirty) {
            form.reset(query.data.settings)
            captured.current = query.data.version
        }
    }, [query.data, form])

    const { tab, requestTab, pendingTab, confirmDiscard, cancelDiscard } = useIntegrationTab<PlatformTab>(PLATFORM_TABS, "cadastro", dirty || legalDirty, () => {
        if (query.data) {
            form.reset(query.data.settings)
            setCaptured(query.data.version)
        }
        setLegalDirty(false)
        setLegalKey((value) => value + 1)
    })

    const submit = async () => {
        if (!(await form.trigger()) || captured.current === null) return
        const values = platformSettingsSchema.parse(form.getValues())
        const saved = await save.mutateAsync({ ...values, version: captured.current }).catch(() => null)
        if (saved) {
            form.reset(saved.settings)
            setCaptured(saved.version)
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
            <IntegrationTabs tabs={TABS} active={tab} onSelect={requestTab} pendingTab={pendingTab} onConfirmDiscard={confirmDiscard} onCancelDiscard={cancelDiscard} label="Seções da Plataforma">
                {tab === "termos" ? (
                    <LegalTermsTab key={legalKey} onDirtyChange={setLegalDirty} />
                ) : query.isLoading ? (
                    <Skeleton className="h-72 w-full" />
                ) : query.isError || !query.data ? (
                    <ErrorState title="Não foi possível carregar a configuração" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : (
                    <form
                        className="flex flex-col gap-6"
                        noValidate
                        onSubmit={(event) => {
                            event.preventDefault()
                            void submit()
                        }}
                    >
                        {tab === "cadastro" && <SignupSection form={form} options={query.data.roleOptions} signup={query.data.signup} readOnly={readOnly} />}
                        {tab === "retencao" && <RetentionSection form={form} readOnly={readOnly} />}
                        {tab === "documentos" && <DocumentsSection form={form} readOnly={readOnly} />}
                        {!readOnly && (
                            <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
                                <Button type="button" variant="outline" className="gap-1.5" disabled={!dirty || save.isPending} onClick={() => { form.reset(query.data.settings); setCaptured(query.data.version) }}>
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
            </IntegrationTabs>
        </motion.div>
    )
}
