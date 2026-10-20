"use client"

import { usePermissions } from "@nandobfer/perfix/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AI_AGENTS, type AiAgentId } from "../../agents"
import { AGENT_MEMORY_LIMIT } from "../../constants"
import { agentMemoriesSource, useMemoriesRealtime } from "../../hooks/useMemories"
import { MemoryList } from "./MemoryList"

/**
 * Card "Memórias" da aba de configuração de um agente (mesmo card de memórias do
 * crm-marketing-campanhas): alimenta e treina o agente com instruções permanentes. Ver exige
 * `ai_memories.view`; criar/editar/excluir, `ai_memories.edit`.
 */
export function AgentMemoriesCard({ agentId }: { agentId: AiAgentId }) {
    const { can } = usePermissions()
    const canView = can("ai_memories.view")
    useMemoriesRealtime(canView)
    if (!canView) return null
    const label = AI_AGENTS[agentId].label
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Memórias</CardTitle>
                <CardDescription>
                    Instruções permanentes que o {label} segue em toda conversa: use para alimentar e treinar o agente. Clique para ver o texto completo. Até {AGENT_MEMORY_LIMIT} memórias.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <MemoryList source={agentMemoriesSource(agentId)} canEdit={can("ai_memories.edit")} emptyTitle="Nenhuma memória" emptyDescription={`Adicione instruções e fatos que o ${label} deve lembrar.`} />
            </CardContent>
        </Card>
    )
}
