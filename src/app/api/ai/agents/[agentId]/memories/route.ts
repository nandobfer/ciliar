import { created, ok } from "@/lib/api/responses"
import { parseBody } from "@/lib/api/route"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { memoryInputSchema } from "@/features/ai/schemas"
import { createAgentMemory, listAgentMemories } from "@/features/ai/server/agent-memory-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/agents/[agentId]/memories — memórias do agente (`ai_memories.view`). */
export const GET = withRoute<{ agentId: string }>(async ({ params }) => ok(await listAgentMemories(currentAccess(), params.agentId)))

/** POST /api/ai/agents/[agentId]/memories — nova memória, formatada pelo Resumo (`ai_memories.edit`). */
export const POST = withRoute<{ agentId: string }>(async ({ req, params }) => {
    const body = await parseBody(req, memoryInputSchema)
    if (!body.ok) return body.response
    return created(await createAgentMemory(currentAccess(), params.agentId, body.data.texto))
})
