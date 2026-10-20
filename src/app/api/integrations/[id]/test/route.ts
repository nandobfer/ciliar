import { NextResponse, type NextRequest } from "next/server"
import { isIntegrationId } from "@/lib/integrations/catalog"
import { runIntegrationTest } from "@/features/integrations/services/integration-test-runner"
import type { IntegrationTestEvent } from "@/features/integrations/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/integrations/[id]/test — teste de conexão sob demanda.
 *
 * Resposta em NDJSON (`application/x-ndjson`): uma linha `{type:"log"}` por evento, à medida
 * que acontecem, e uma linha final `{type:"result"}`.
 */
export const POST = protectRoute(handlePost)
async function handlePost(request: NextRequest, { params }: Params) {
    const { id } = await params
    if (!isIntegrationId(id)) {
        return NextResponse.json({ success: false, error: "Integração não encontrada" }, { status: 404 })
    }
    const encoder = new TextEncoder()
    // O teste agregado invoca todos os provedores: exige autorização em cada um.
    if (id === "ai") requirePermissions(currentAccess(), "integrations.ai_opencode.test", "integrations.ai_gemini.test", "integrations.ai_anthropic.test", "integrations.ai_openai.test", "integrations.ai_deepseek.test", "integrations.ai_jev.test")
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let open = true
            const write = (event: IntegrationTestEvent) => {
                if (!open) return
                try {
                    controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
                } catch {
                    open = false
                }
            }
            const result = await runIntegrationTest(id, {
                source: "manual",
                signal: request.signal,
                emit: (level, message) => write({ type: "log", level, message, ts: new Date().toISOString() }),
            })
            write({ type: "result", ...result, ts: new Date().toISOString() })
            if (open) controller.close()
        },
    })

    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    })
}
import { protectRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { requirePermissions } from "@/features/access/server/access"
