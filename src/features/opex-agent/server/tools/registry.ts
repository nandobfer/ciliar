import type { OpexConfirmationPolicy } from "../../constants"
import { canUseOpexTool, enabledOpexToolNames } from "../../tool-catalog"
import type { OpexTool } from "./define"
import { apiTokenTools } from "./api-tokens"
import { contextTools } from "./context"
import { fileTools } from "./files"
import { integrationTools } from "./integrations"
import { roleTools } from "./roles"
import { userTools } from "./users"

/** Todas as ferramentas do Agente Opex (nomes únicos; o modelo as vê pelo nome). */
export const OPEX_TOOLS: readonly OpexTool[] = [
    ...contextTools,
    ...fileTools,
    ...userTools,
    ...roleTools,
    ...integrationTools,
    ...apiTokenTools,
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

export function needsConfirmation(tool: OpexTool, policy: OpexConfirmationPolicy): boolean {
    return tool.risk === "destructive" || (policy === "writes" && tool.risk === "write")
}
