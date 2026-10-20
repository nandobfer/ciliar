import { Types } from "mongoose"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { AgentMemory, type IAgentMemory } from "@/lib/db/models/AgentMemory"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { integrationChannel, publishToChannels } from "@/lib/pusher/channels"
import type { AccessContext } from "@/features/access/server/context"
import { requirePermissions } from "@/features/access/server/access"
import { accessModels } from "@/features/access/server/models"
import { AI_AGENTS, isAiAgentId, type AiAgentId } from "../agents"
import { AGENT_MEMORY_LIMIT, AI_MEMORIES_UPDATED_EVENT, AI_MEMORY_AUDIT_ENTITY } from "../constants"
import { memoryInputSchema } from "../schemas"
import type { MemoryDto, MemoryMutationResult } from "../types"
import { formatMemory } from "./summary"

/**
 * Memórias (instruções permanentes) dos agentes de IA, uma lista por agente do catálogo
 * `agents.ts`. Criar e editar passam pelo uso "Resumo" (texto formatado + resumo de uma linha).
 * Excluir remove (a auditoria guarda o texto). Até 50 por agente. Copiado do crm-marketing-campanhas.
 * Ver exige `ai_memories.view`; alterar, `ai_memories.edit` (inclusive pelas ferramentas do Agente Opex).
 */

export function assertAgentId(agentId: string): AiAgentId {
    if (!isAiAgentId(agentId)) throw new DomainError(404, "Agente não encontrado", "AI_AGENT_NOT_FOUND")
    return agentId
}

export function toMemoryDto(memory: Pick<IAgentMemory, "_id" | "texto" | "resumo" | "createdAt" | "updatedAt" | "updatedBy">, names: ReadonlyMap<string, string>): MemoryDto {
    return {
        id: String(memory._id),
        texto: memory.texto,
        resumo: memory.resumo,
        autor: names.get(memory.updatedBy) ?? null,
        criadaEm: new Date(memory.createdAt).toISOString(),
        atualizadaEm: new Date(memory.updatedAt).toISOString(),
    }
}

async function namesFor(memories: Pick<IAgentMemory, "updatedBy">[]): Promise<Map<string, string>> {
    const ids = [...new Set(memories.map((memory) => memory.updatedBy).filter((id) => Types.ObjectId.isValid(id)))]
    if (!ids.length) return new Map()
    const users = await accessModels().users.find({ _id: { $in: ids } }).select({ name: 1 }).lean()
    return new Map(users.map((user) => [String(user._id), user.name]))
}

async function publish(agentId: AiAgentId) {
    await publishToChannels([integrationChannel("ai")], AI_MEMORIES_UPDATED_EVENT, { agentId }).catch(() => undefined)
}

export async function listAgentMemories(access: AccessContext, agentId: string): Promise<MemoryDto[]> {
    requirePermissions(access, "ai_memories.view")
    const agent = assertAgentId(agentId)
    await dbConnect()
    const rows = (await AgentMemory.find({ agentId: agent }).sort({ createdAt: -1 }).limit(AGENT_MEMORY_LIMIT).lean()) as IAgentMemory[]
    const names = await namesFor(rows)
    return rows.map((row) => toMemoryDto(row, names))
}

export async function getAgentMemory(access: AccessContext, agentId: string, id: string): Promise<MemoryDto> {
    requirePermissions(access, "ai_memories.view")
    const memory = await findMemory(assertAgentId(agentId), id)
    return toMemoryDto(memory, await namesFor([memory]))
}

/** Textos das memórias para o prompt do agente (em ordem de criação). Sem permissão: é o próprio agente lendo. */
export async function agentMemoryTexts(agentId: AiAgentId): Promise<string[]> {
    await dbConnect()
    const rows = await AgentMemory.find({ agentId }).sort({ createdAt: 1 }).limit(AGENT_MEMORY_LIMIT).select("texto").lean()
    return rows.map((row) => row.texto)
}

/** Seção das memórias para as instruções de sistema (vazia sem memórias). */
export function memoriesSection(texts: readonly string[]): string {
    if (!texts.length) return ""
    return ["", "## Memórias e instruções permanentes", "Siga sempre estas memórias, cadastradas pela administração:", ...texts.map((text) => `- ${text.replace(/\n+/g, " ")}`)].join("\n")
}

function parseText(texto: string): string {
    const parsed = memoryInputSchema.safeParse({ texto })
    if (!parsed.success) throw new DomainError(400, parsed.error.issues[0]?.message ?? "Memória inválida", "VALIDATION_ERROR")
    return parsed.data.texto
}

export async function createAgentMemory(access: AccessContext, agentId: string, texto: string): Promise<MemoryMutationResult> {
    requirePermissions(access, "ai_memories.edit")
    const agent = assertAgentId(agentId)
    const input = parseText(texto)
    await dbConnect()
    if ((await AgentMemory.countDocuments({ agentId: agent })) >= AGENT_MEMORY_LIMIT) {
        throw new DomainError(409, `Limite de ${AGENT_MEMORY_LIMIT} memórias atingido. Exclua uma antes de adicionar outra.`, "MEMORY_LIMIT")
    }
    const formatted = await formatMemory(input)
    const now = new Date()
    const memory = (await AgentMemory.create({ agentId: agent, texto: formatted.texto, resumo: formatted.resumo, createdBy: access.userId, updatedBy: access.userId, createdAt: now, updatedAt: now })).toObject() as IAgentMemory
    await recordAudit({ userId: access.userId, entidade: AI_MEMORY_AUDIT_ENTITY, entidadeId: String(memory._id), acao: AcaoAuditoria.CRIAR, depois: { agente: agent, texto: memory.texto } })
    loggerFor({ userId: access.userId }).info({ agentId: agent, formatadaPorIa: formatted.formatadaPorIa }, `[ai] Memória do ${AI_AGENTS[agent].label} criada`)
    await publish(agent)
    return { memoria: toMemoryDto(memory, await namesFor([memory])), formatadaPorIa: formatted.formatadaPorIa }
}

async function findMemory(agentId: AiAgentId, id: string): Promise<IAgentMemory> {
    if (!Types.ObjectId.isValid(id)) throw new DomainError(404, "Memória não encontrada", "NOT_FOUND")
    await dbConnect()
    const memory = (await AgentMemory.findOne({ agentId, _id: id }).lean()) as IAgentMemory | null
    if (!memory) throw new DomainError(404, "Memória não encontrada", "NOT_FOUND")
    return memory
}

export async function updateAgentMemory(access: AccessContext, agentId: string, id: string, texto: string): Promise<MemoryMutationResult> {
    requirePermissions(access, "ai_memories.edit")
    const agent = assertAgentId(agentId)
    const input = parseText(texto)
    const current = await findMemory(agent, id)
    const formatted = await formatMemory(input)
    const updated = (await AgentMemory.findOneAndUpdate(
        { _id: current._id },
        { $set: { texto: formatted.texto, resumo: formatted.resumo, updatedBy: access.userId, updatedAt: new Date() } },
        { returnDocument: "after" },
    ).lean()) as IAgentMemory
    await recordAudit({ userId: access.userId, entidade: AI_MEMORY_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: { agente: agent, texto: current.texto }, depois: { agente: agent, texto: updated.texto } })
    await publish(agent)
    return { memoria: toMemoryDto(updated, await namesFor([updated])), formatadaPorIa: formatted.formatadaPorIa }
}

export async function deleteAgentMemory(access: AccessContext, agentId: string, id: string): Promise<MemoryDto> {
    requirePermissions(access, "ai_memories.edit")
    const agent = assertAgentId(agentId)
    const current = await findMemory(agent, id)
    await AgentMemory.deleteOne({ _id: current._id })
    await recordAudit({ userId: access.userId, entidade: AI_MEMORY_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: { agente: agent, texto: current.texto } })
    await publish(agent)
    return toMemoryDto(current, await namesFor([current]))
}
