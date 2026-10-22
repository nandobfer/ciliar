import type { OpexConfirmationPolicy } from "../../constants"
import { canUseOpexTool, enabledOpexToolNames, toolConfirms } from "../../tool-catalog"
import type { OpexTool } from "./define"
import { apiTokenTools } from "./api-tokens"
import { businessTools } from "./businesses"
import { businessActivityTools } from "./business-activities"
import { businessGoalTools } from "./business-goals"
import { businessDocumentTools } from "./business-documents"
import { businessSuccessTools } from "./business-successes"
import { clientTools } from "./clients"
import { orderTools } from "./orders"
import { workColumnTools, workNoteTools, workTimeTools, workTools } from "./works"
import { portfolioItemTools, portfolioTools } from "./portfolio"
import { contextTools } from "./context"
import { fileTools } from "./files"
import { memoryTools } from "./memories"
import { integrationTools } from "./integrations"
import { platformTools } from "./platform"
import { roleTools } from "./roles"
import { userTools } from "./users"

/** Todas as ferramentas do Agente Opex (nomes únicos; o modelo as vê pelo nome). */
export const OPEX_TOOLS: readonly OpexTool[] = [
    ...contextTools,
    ...fileTools,
    ...businessTools,
    ...businessActivityTools,
    ...businessGoalTools,
    ...businessDocumentTools,
    ...businessSuccessTools,
    ...clientTools,
    ...orderTools,
    ...workColumnTools,
    ...workTools,
    ...workTimeTools,
    ...workNoteTools,
    ...portfolioTools,
    ...portfolioItemTools,
    ...memoryTools,
    ...userTools,
    ...roleTools,
    ...integrationTools,
    ...apiTokenTools,
    ...platformTools,
] as readonly OpexTool[]

export function findOpexTool(name: string): OpexTool | undefined {
    return OPEX_TOOLS.find((tool) => tool.name === name)
}

/**
 * Ferramentas do turno: ligadas na configuração **e** liberadas pelas permissões efetivas do usuário
 * (já intersectadas com a simulação). O contexto fica sempre disponível.
 */
export function enabledOpexTools(disabledTools: readonly string[], permissions: ReadonlySet<string>): OpexTool[] {
    const enabled = new Set(enabledOpexToolNames(disabledTools))
    return OPEX_TOOLS.filter((tool) => enabled.has(tool.name) && canUseOpexTool(tool, permissions))
}

/** Pela política geral e pelo ajuste de cada ferramenta (`confirmationOverrides`). */
export function needsConfirmation(tool: OpexTool, policy: OpexConfirmationPolicy, overrides: Readonly<Record<string, boolean>> = {}): boolean {
    return toolConfirms(tool, policy, overrides)
}
