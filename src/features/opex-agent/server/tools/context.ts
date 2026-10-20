import { z } from "zod"
import { OPEX_TOOL_GROUPS } from "../../constants"
import { enabledOpexToolNames, canUseOpexTool, OPEX_TOOL_CATALOG } from "../../tool-catalog"
import { loadOpexSettings } from "../settings"
import { defineTool } from "./define"

const TIME_ZONE = "America/Sao_Paulo"

export function nowContext(now = new Date()) {
    return {
        iso: now.toISOString(),
        local: new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short", timeZone: TIME_ZONE }).format(now),
        timeZone: TIME_ZONE,
    }
}

export const contextTools = [
    defineTool("get_app_overview", {
        input: z.object({}),
        execute: async (_input, { access }) => {
            const { settings } = await loadOpexSettings()
            const enabled = new Set(enabledOpexToolNames(settings.disabledTools))
            const available = OPEX_TOOL_CATALOG.filter((tool) => enabled.has(tool.name) && canUseOpexTool(tool, access.effective))
            const simulation = access.dto.simulation
            return {
                now: nowContext(),
                user: { id: access.userId, name: access.name },
                simulation: simulation ? { kind: simulation.tipo === "cargo" ? "perfil" : "usuário", target: simulation.alvoNome } : null,
                roles: access.roles.map((role) => ({ id: role.id, name: role.nome, active: role.ativo })),
                administrator: access.effective.has("*"),
                permissions: access.effective.has("*") ? ["*"] : [...access.effective].sort(),
                toolsByGroup: Object.fromEntries(OPEX_TOOL_GROUPS.map((group) => [group, available.filter((tool) => tool.group === group).map((tool) => tool.name)])),
            }
        },
    }),
]
