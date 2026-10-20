import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server-core"

vi.mock("@/lib/db", async (original) => ({ ...(await original<object>()), dbConnect: vi.fn(async () => undefined) }))
vi.mock("ai", () => ({ dynamicTool: (def: unknown) => def }))
const pusher = vi.hoisted(() => ({ publishToChannels: vi.fn(async () => undefined) }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: pusher.publishToChannels, integrationChannel: (id: string) => `private-integration-${id}` }))
const ai = vi.hoisted(() => ({ reply: "" as string | null }))
vi.mock("@/lib/ai/catalog", async (original) => ({ ...(await original<object>()), getAiProviderStatuses: async () => [{ id: "gemini", configured: true, connected: true }] }))
vi.mock("@/lib/ai/stream", async (original) => ({
    ...(await original<object>()),
    streamAi: async function* () {
        if (ai.reply === null) yield { type: "error", message: "fora do ar" }
        else yield { type: "delta", text: ai.reply }
    },
}))

import { accessModels } from "@/features/access/server/models"
import { resolveAccess } from "@/features/access/server/access"
import { requestAccess, type AccessContext } from "@/features/access/server/context"
import { AgentMemory } from "@/lib/db/models/AgentMemory"
import { AiFeatureSetting } from "@/lib/db/models/Ai"
import { AuditLog } from "@/lib/db/models/AuditLog"
import { agentMemoryTexts, createAgentMemory, deleteAgentMemory, listAgentMemories, updateAgentMemory } from "@/features/ai/server/agent-memory-service"
import { DEFAULT_SUMMARY_FEATURE } from "@/features/ai/schemas"
import { AGENT_MEMORY_LIMIT } from "@/features/ai/constants"
import { findOpexTool } from "@/features/opex-agent/server/tools/registry"

/** Memórias dos agentes contra os serviços reais (MongoMemoryReplSet efêmero; nunca o banco real). */

let replica: MongoMemoryReplSet
let admin: AccessContext
const access = accessModels()

async function user(name: string, permissoes: string[]) {
    const role = await access.roles.create({ slug: name.toLowerCase(), nome: name, permissoes, ativo: true })
    const created = await access.users.create({ name, email: `${name.toLowerCase()}@example.test`, active: true, roles: [role.id] })
    return resolveAccess(created.id as string)
}
const enableSummary = () => AiFeatureSetting.create({ feature: "summary", settings: { ...DEFAULT_SUMMARY_FEATURE, enabled: true, main: { ...DEFAULT_SUMMARY_FEATURE.main, provider: "gemini", model: "gemini-x" } }, updatedBy: "x" })

async function run(name: string, raw: unknown, context: AccessContext) {
    const tool = findOpexTool(name)!
    const input = tool.input.parse(raw)
    const scope = { userId: context.userId, viewAsHeader: context.viewAsHeader, sessionVersion: context.sessionVersion }
    return requestAccess.run(context, () => tool.execute(input, { sessionId: "s".repeat(24), actorId: context.userId, scope, access: context })) as Promise<Record<string, unknown>>
}

beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.18" }, replSet: { count: 1 }, instanceOpts: [{ ip: "127.0.0.1" }] })
    await mongoose.connect(replica.getUri("ciliar_memories_test"))
    await Promise.all([...Object.values(access), AgentMemory, AiFeatureSetting, AuditLog].map((model) => model.init()))
}, 120_000)
beforeEach(async () => {
    vi.clearAllMocks()
    ai.reply = ""
    await Promise.all([...Object.values(access), AgentMemory, AiFeatureSetting, AuditLog].map((model) => model.deleteMany({})))
    admin = await user("Admin", ["*"])
})
afterAll(async () => {
    await mongoose.disconnect()
    await replica?.stop()
})

describe("memórias dos agentes", () => {
    it("sem o Resumo salva como escrita; com ele, revisa e resume; auditoria e tempo real", async () => {
        const plain = await createAgentMemory(admin, "opex-agent", "Responda sempre em pt-BR. Seja breve.")
        expect(plain).toMatchObject({ formatadaPorIa: false, memoria: { texto: "Responda sempre em pt-BR. Seja breve.", resumo: "Responda sempre em pt-BR", autor: "Admin" } })
        await enableSummary()
        ai.reply = '{"texto": "Nunca prometa prazos de entrega.", "resumo": "Sem promessa de prazo"}'
        const formatted = await createAgentMemory(admin, "business-interviewer", "nunca prometa prazo")
        expect(formatted).toMatchObject({ formatadaPorIa: true, memoria: { texto: "Nunca prometa prazos de entrega.", resumo: "Sem promessa de prazo" } })
        ai.reply = null
        const fallback = await updateAgentMemory(admin, "business-interviewer", formatted.memoria.id, "Pergunte o nome primeiro.")
        expect(fallback).toMatchObject({ formatadaPorIa: false, memoria: { texto: "Pergunte o nome primeiro." } })

        expect((await listAgentMemories(admin, "opex-agent")).map((item) => item.id)).toEqual([plain.memoria.id])
        expect(await agentMemoryTexts("business-interviewer")).toEqual(["Pergunte o nome primeiro."])
        expect(pusher.publishToChannels).toHaveBeenCalledWith(["private-integration-ai"], "ai-memories-updated", { agentId: "business-interviewer" })
        await deleteAgentMemory(admin, "business-interviewer", formatted.memoria.id)
        expect(await agentMemoryTexts("business-interviewer")).toEqual([])
        const audits = await AuditLog.find({ entidade: "MemoriaAgente" }).sort({ timestamp: 1 }).lean()
        expect(audits.map((audit) => audit.acao)).toEqual(["CRIAR", "CRIAR", "ATUALIZAR", "EXCLUIR"])
        expect(audits.at(-1)?.dadosAnteriores).toMatchObject({ texto: "Pergunte o nome primeiro." })
    })

    it("permissões, agente desconhecido, texto inválido e limite", async () => {
        const viewer = await user("Leitor", ["ai_memories.view"])
        await createAgentMemory(admin, "opex-agent", "Memória um")
        expect(await listAgentMemories(viewer, "opex-agent")).toHaveLength(1)
        await expect(createAgentMemory(viewer, "opex-agent", "Memória dois")).rejects.toMatchObject({ status: 403 })
        await expect(listAgentMemories(await user("Sem", ["admin.access"]), "opex-agent")).rejects.toMatchObject({ status: 403 })
        await expect(listAgentMemories(admin, "sales-agent")).rejects.toMatchObject({ status: 404, code: "AI_AGENT_NOT_FOUND" })
        await expect(createAgentMemory(admin, "opex-agent", "x")).rejects.toMatchObject({ status: 400 })
        await expect(updateAgentMemory(admin, "business-interviewer", (await listAgentMemories(admin, "opex-agent"))[0]!.id, "Outro agente")).rejects.toMatchObject({ status: 404 })
        await AgentMemory.insertMany(Array.from({ length: AGENT_MEMORY_LIMIT - 1 }, (_, index) => ({ agentId: "opex-agent", texto: `M ${index}`, resumo: `M ${index}`, createdBy: "x", updatedBy: "x" })))
        await expect(createAgentMemory(admin, "opex-agent", "Uma a mais")).rejects.toMatchObject({ status: 409, code: "MEMORY_LIMIT" })
    })

    it("ferramentas do Agente Opex gerenciam as memórias de qualquer agente, inclusive as próprias", async () => {
        const created = await run("create_agent_memory", { agent: "opex-agent", text: "Liste antes de alterar." }, admin)
        expect(created).toMatchObject({ ok: true, agent: "opex-agent", text: "Liste antes de alterar.", formattedByAi: false })
        await run("create_agent_memory", { agent: "business-interviewer", text: "Pergunte a área com exemplos." }, admin)
        const all = (await run("list_agent_memories", {}, admin)) as { total: number; agents: { agent: string; items: unknown[] }[] }
        expect(all.total).toBe(2)
        expect(all.agents.map((list) => [list.agent, list.items.length])).toEqual([["opex-agent", 1], ["business-interviewer", 1]])
        const id = created.id as string
        expect(await run("get_agent_memory", { agent: "opex-agent", memoryId: id }, admin)).toMatchObject({ text: "Liste antes de alterar." })
        expect(await run("update_agent_memory", { agent: "opex-agent", memoryId: id, text: "Liste e confira antes de alterar." }, admin)).toMatchObject({ text: "Liste e confira antes de alterar." })
        expect(await run("delete_agent_memory", { agent: "opex-agent", memoryId: id }, admin)).toMatchObject({ ok: true })
        expect(() => findOpexTool("create_agent_memory")!.input.parse({ agent: "sales-agent", text: "abc" })).toThrow()
        const viewer = await user("Leitor2", ["ai_memories.view"])
        await expect(run("create_agent_memory", { agent: "opex-agent", text: "Sem permissão" }, viewer)).rejects.toMatchObject({ status: 403 })
    })
})
