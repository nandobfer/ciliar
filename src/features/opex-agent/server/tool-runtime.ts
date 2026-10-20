import { dynamicTool, type ToolSet } from "ai"
import { loggerFor } from "@/lib/logger"
import { requestAccess, type AccessContext } from "@/features/access/server/context"
import type { OpexConfirmationPolicy } from "../constants"
import type { OpexConfirmationDto } from "../types"
import { toolErrorMessage, type OpexTool, type OpexToolContext } from "./tools/define"
import { needsConfirmation } from "./tools/registry"

/** Saída de ferramenta enviada ao modelo (o resto é cortado com aviso). */
export const MAX_TOOL_OUTPUT_CHARS = 30_000
/** Entrada/saída guardadas para exibição no card. */
export const MAX_TOOL_DISPLAY_CHARS = 6000

const log = loggerFor({ module: "opex-agent" })

export function stringifyForDisplay(value: unknown, max = MAX_TOOL_DISPLAY_CHARS): string | null {
    if (value === undefined) return null
    let text: string
    try {
        text = typeof value === "string" ? value : JSON.stringify(value, null, 2)
    } catch {
        text = String(value)
    }
    if (text === undefined) return null
    return text.length > max ? `${text.slice(0, max)}\n…(+${(text.length - max).toLocaleString("pt-BR")} caracteres)` : text
}

/** Resultado grande vira um texto cortado (o modelo é avisado para refinar a consulta). */
export function compactToolOutput(value: unknown): unknown {
    const json = JSON.stringify(value ?? null) ?? "null"
    if (json.length <= MAX_TOOL_OUTPUT_CHARS) return value ?? null
    return {
        truncated: true,
        note: `Resultado com ${json.length.toLocaleString("pt-BR")} caracteres cortado em ${MAX_TOOL_OUTPUT_CHARS.toLocaleString("pt-BR")}: use filtros ou limites menores para ver o resto.`,
        partialJson: json.slice(0, MAX_TOOL_OUTPUT_CHARS),
    }
}

export interface ToolRuntimeHooks {
    /** Grava a ação pendente e devolve o card de confirmação. */
    requestConfirmation: (tool: OpexTool, input: unknown, toolCallId: string) => Promise<OpexConfirmationDto>
    /**
     * Revalida o acesso à ferramenta **imediatamente antes** de executar ou pedir confirmação: relê a
     * sessão, a conta, os perfis, a simulação e a configuração (ferramenta desligada ou permissão
     * perdida no meio do turno vale na hora) e devolve o acesso atual para a execução.
     */
    authorize: (tool: OpexTool, input: unknown) => Promise<AccessContext>
}

export interface ToolRuntime {
    tools: ToolSet
    /** Confirmações pedidas neste turno, por chamada. */
    confirmations: Map<string, OpexConfirmationDto>
    durations: Map<string, number>
}

/** Converte as ferramentas do registro em ferramentas da AI SDK (execução no servidor do app). */
/** Política geral de confirmação e o ajuste de cada ferramenta (`confirmationOverrides`). */
export type ToolConfirmationSettings = OpexConfirmationPolicy | { policy: OpexConfirmationPolicy; overrides: Readonly<Record<string, boolean>> }

export function buildToolRuntime(list: readonly OpexTool[], context: Omit<OpexToolContext, "access">, confirmation: ToolConfirmationSettings, hooks: ToolRuntimeHooks): ToolRuntime {
    const { policy, overrides } = typeof confirmation === "string" ? { policy: confirmation, overrides: {} } : confirmation
    const confirmations = new Map<string, OpexConfirmationDto>()
    const durations = new Map<string, number>()
    const tools: ToolSet = {}
    for (const def of list) {
        tools[def.name] = dynamicTool({
            description: def.description,
            inputSchema: def.input,
            execute: async (input: unknown, options) => {
                const startedAt = Date.now()
                try {
                    const parsed = def.input.parse(input)
                    const access = await hooks.authorize(def, parsed)
                    if (needsConfirmation(def, policy, overrides)) {
                        const confirmation = await hooks.requestConfirmation(def, parsed, options.toolCallId)
                        confirmations.set(options.toolCallId, confirmation)
                        return {
                            status: "confirmation_required",
                            actionId: confirmation.actionId,
                            summary: confirmation.summary,
                            instruction: "A ação NÃO foi executada: aguarda o usuário clicar em Confirmar ou Cancelar no chat. Diga em uma frase o que será feito e encerre a resposta.",
                        }
                    }
                    // A execução roda no contexto de acesso revalidado (auditoria com o ator real e a simulação).
                    const output = await requestAccess.run(access, () => def.execute(parsed, { ...context, access, signal: options.abortSignal ?? context.signal }))
                    return compactToolOutput(output)
                } catch (error) {
                    const message = toolErrorMessage(error)
                    log.info({ tool: def.name, sessionId: context.sessionId, err: message }, "[opex] ferramenta falhou")
                    throw new Error(message)
                } finally {
                    durations.set(options.toolCallId, Date.now() - startedAt)
                }
            },
        })
    }
    return { tools, confirmations, durations }
}
