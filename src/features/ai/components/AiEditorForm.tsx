"use client"

import { useState, type Dispatch, type SetStateAction } from "react"
import { motion } from "framer-motion"
import { BrainCircuit, Bot, MessagesSquare, ReceiptText, ScrollText } from "lucide-react"
import type { IntegrationDef } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"
import { DetailActions } from "@/features/integrations/components/detail/DetailActions"
import { DetailHeader } from "@/features/integrations/components/detail/DetailHeader"
import type { Draft } from "@/features/integrations/components/detail/draft"
import { GeneralCard } from "@/features/integrations/components/detail/GeneralCard"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { useIntegrationTab } from "@/features/integrations/components/tabs/useIntegrationTab"
import { AI_TABS, type AiTab } from "../constants"
import { useAiFeatureRealtime } from "../hooks/useAi"
import { AiProvidersTab } from "./AiProvidersTab"
import { OpexAgentTab } from "@/features/opex-agent/components/settings/OpexAgentTab"
import { InterviewerAgentTab } from "@/features/businesses/components/settings/InterviewerAgentTab"
import { SummaryFeatureTab } from "./summary/SummaryFeatureTab"
import { OrderTitleFeatureTab } from "@/features/orders/components/OrderTitleFeatureTab"

interface AiEditorFormProps {
    def: IntegrationDef
    data: IntegrationDetailDto
    draft: Draft
    setDraft: Dispatch<SetStateAction<Draft>>
    dirty: boolean
    pending: boolean
    onSave: () => Promise<boolean>
    onUndo: () => void
}

const TABS: IntegrationTabDef<AiTab>[] = [
    { id: "provedores", label: "Provedores", icon: BrainCircuit },
    { id: "agente-opex", label: "Agente Opex", icon: Bot },
    { id: "agente-entrevistador", label: "Agente Entrevistador", icon: MessagesSquare },
    { id: "titulo-pedidos", label: "Título de pedidos", icon: ReceiptText },
    { id: "resumo", label: "Resumo", icon: ScrollText },
]

/**
 * Página "Provedores de IA" (`/integracoes/ia`): aba Provedores (provedores e as opções gerais do hub)
 * e a aba do Agente Opex. Trocar de aba com alterações pede descarte.
 */
export function AiEditorForm({ def, data, draft, setDraft, dirty, pending, onSave, onUndo }: AiEditorFormProps) {
    useAiFeatureRealtime()
    const [tabDirty, setTabDirty] = useState(false)
    const [resetKey, setResetKey] = useState(0)
    const { tab, requestTab, pendingTab, confirmDiscard, cancelDiscard } = useIntegrationTab<AiTab>(AI_TABS, "provedores", dirty || tabDirty, () => {
        onUndo()
        setTabDirty(false)
        setResetKey((value) => value + 1)
    })

    return (
        <motion.form
            key="form"
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex min-w-0 flex-col gap-6"
            onSubmit={(event) => {
                event.preventDefault()
                if (tab === "provedores" && dirty) void onSave()
            }}
        >
            <DetailHeader def={def} data={data} hasAnySecret={false} />
            <IntegrationTabs tabs={TABS} active={tab} onSelect={requestTab} pendingTab={pendingTab} onConfirmDiscard={confirmDiscard} onCancelDiscard={cancelDiscard} label="Seções de Provedores de IA">
                {tab === "provedores" && (
                    <>
                        <AiProvidersTab />
                        <GeneralCard draft={draft} setDraft={setDraft} />
                        <DetailActions dirty={dirty} pending={pending} onUndo={onUndo} />
                    </>
                )}
                {tab === "agente-opex" && <OpexAgentTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "agente-entrevistador" && <InterviewerAgentTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "titulo-pedidos" && <OrderTitleFeatureTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "resumo" && <SummaryFeatureTab key={resetKey} onDirtyChange={setTabDirty} />}
            </IntegrationTabs>
        </motion.form>
    )
}
