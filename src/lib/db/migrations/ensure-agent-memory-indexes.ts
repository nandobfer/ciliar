import { AgentMemory } from "@/lib/db/models/AgentMemory"

/** Índice das memórias dos agentes (`agent_memories`). Idempotente. */
export async function ensureAgentMemoryIndexes(): Promise<void> {
    await AgentMemory.createIndexes()
}
