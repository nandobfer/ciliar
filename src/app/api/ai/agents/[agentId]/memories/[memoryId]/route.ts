import { ok } from "@/lib/api/responses"
import { parseBody } from "@/lib/api/route"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { memoryInputSchema } from "@/features/ai/schemas"
import { deleteAgentMemory, getAgentMemory, updateAgentMemory } from "@/features/ai/server/agent-memory-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { agentId: string; memoryId: string }

/** GET /api/ai/agents/[agentId]/memories/[memoryId] — uma memória (`ai_memories.view`). */
export const GET = withRoute<Params>(async ({ params }) => ok(await getAgentMemory(currentAccess(), params.agentId, params.memoryId)))

/** PATCH — edita o texto (reformatado pelo Resumo; `ai_memories.edit`). */
export const PATCH = withRoute<Params>(async ({ req, params }) => {
    const body = await parseBody(req, memoryInputSchema)
    if (!body.ok) return body.response
    return ok(await updateAgentMemory(currentAccess(), params.agentId, params.memoryId, body.data.texto))
})

/** DELETE — exclui (a auditoria guarda o texto; `ai_memories.edit`). */
export const DELETE = withRoute<Params>(async ({ params }) => ok(await deleteAgentMemory(currentAccess(), params.agentId, params.memoryId)))
