import { z } from "zod"
import { objectId } from "@/features/access/schemas"
import { AI_AGENT_IDS, AI_AGENTS, type AiAgentId } from "@/features/ai/agents"
import { MEMORY_TEXT_MAX } from "@/features/ai/schemas"
import { createAgentMemory, deleteAgentMemory, getAgentMemory, listAgentMemories, updateAgentMemory } from "@/features/ai/server/agent-memory-service"
import type { MemoryDto } from "@/features/ai/types"
import { defineTool } from "./define"

/**
 * Memórias dos agentes de IA: chamam o serviço real (`agent-memory-service`) com o acesso do usuário,
 * que confere `ai_memories.view/edit`. O agente é um enum do catálogo `src/features/ai/agents.ts`, então
 * agentes futuros entram sozinhos. Exceção documentada no `AGENTS.md`: o Agente Opex pode gerenciar
 * as próprias memórias (o resto da configuração dele continua fora das ferramentas).
 */

const agent = z.enum(AI_AGENT_IDS).describe(AI_AGENT_IDS.map((id) => `${id} = ${AI_AGENTS[id].label}`).join("; "))
const memoryId = objectId.describe("Id da memória (de list_agent_memories)")
const text = z.string().trim().min(3, "Escreva a memória").max(MEMORY_TEXT_MAX, "Até 2.000 caracteres").describe("Texto livre da memória (instrução ou fato permanente)")

const view = (agentId: AiAgentId, memory: MemoryDto) => ({ agent: agentId, agentLabel: AI_AGENTS[agentId].label, id: memory.id, summary: memory.resumo, text: memory.texto, author: memory.autor, createdAt: memory.criadaEm, updatedAt: memory.atualizadaEm })
const short = (value: string) => (value.length > 80 ? `${value.slice(0, 79)}…` : value)

export const memoryTools = [
    defineTool("list_agent_memories", {
        input: z.object({ agent: agent.optional() }),
        async execute(input, { access }) {
            const agents = input.agent ? [input.agent] : [...AI_AGENT_IDS]
            const lists = await Promise.all(agents.map(async (id) => ({ agent: id, agentLabel: AI_AGENTS[id].label, items: (await listAgentMemories(access, id)).map((memory) => view(id, memory)) })))
            return { agents: lists, total: lists.reduce((sum, list) => sum + list.items.length, 0) }
        },
    }),
    defineTool("get_agent_memory", {
        input: z.object({ agent, memoryId }),
        async execute(input, { access }) {
            return view(input.agent, await getAgentMemory(access, input.agent, input.memoryId))
        },
    }),
    defineTool("create_agent_memory", {
        input: z.object({ agent, text }),
        summarize: (input) => `Criar a memória do ${AI_AGENTS[input.agent].label}: "${short(input.text)}"`,
        async execute(input, { access }) {
            const result = await createAgentMemory(access, input.agent, input.text)
            return { ok: true, ...view(input.agent, result.memoria), formattedByAi: result.formatadaPorIa }
        },
    }),
    defineTool("update_agent_memory", {
        input: z.object({ agent, memoryId, text }),
        summarize: (input) => `Editar a memória do ${AI_AGENTS[input.agent].label}: "${short(input.text)}"`,
        async execute(input, { access }) {
            const result = await updateAgentMemory(access, input.agent, input.memoryId, input.text)
            return { ok: true, ...view(input.agent, result.memoria), formattedByAi: result.formatadaPorIa }
        },
    }),
    defineTool("delete_agent_memory", {
        input: z.object({ agent, memoryId }),
        summarize: (input) => `Excluir a memória ${input.memoryId} do ${AI_AGENTS[input.agent].label}`,
        async execute(input, { access }) {
            const removed = await deleteAgentMemory(access, input.agent, input.memoryId)
            return { ok: true, deleted: view(input.agent, removed) }
        },
    }),
]
