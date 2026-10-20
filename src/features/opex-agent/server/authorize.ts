import { DomainError } from "@/lib/api/route"
import type { AccessContext } from "@/features/access/server/context"
import { canUseOpexTool, enabledOpexToolNames, opexToolPermissionLabel } from "../tool-catalog"
import { resolveScopeAccess, type OpexServerScope } from "./scope"
import { loadOpexSettings } from "./settings"
import { OpexToolError, type OpexTool } from "./tools/define"

/**
 * Autorização de uma ferramenta, **imediatamente antes** de pedir confirmação ou executar:
 *
 * 1. relê o acesso do usuário real (conta ativa, versão da sessão, perfis e simulação);
 * 2. confere que o agente segue ativo e a ferramenta segue ligada na configuração;
 * 3. confere as permissões do catálogo e as que dependem da entrada (`authorize` da ferramenta).
 *
 * Os serviços chamados pela ferramenta autorizam de novo (ex.: `authorityTransaction`).
 */
export async function authorizeOpexTool(tool: OpexTool, input: unknown, scope: OpexServerScope): Promise<AccessContext> {
    const access = await resolveScopeAccess(scope)
    const { settings } = await loadOpexSettings()
    if (!settings.enabled) throw new OpexToolError("O Agente Opex foi desativado na configuração.")
    if (!enabledOpexToolNames(settings.disabledTools).includes(tool.name)) throw new OpexToolError(`A ferramenta ${tool.name} está desligada na configuração do agente.`)
    if (!canUseOpexTool(tool, access.effective)) {
        const required = opexToolPermissionLabel(tool)
        throw new DomainError(403, `Seu acesso não permite usar ${tool.name}${required ? ` (exige ${required})` : ""}.`, "FORBIDDEN")
    }
    tool.authorize?.(input, access)
    return access
}
