import { NextResponse } from "next/server"
import { protectRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { canSeeIntegration } from "@/features/access/catalog"
import { logApiError } from "@/lib/logger"
import { listIntegrations } from "@/features/integrations/services/integration-service"

/** GET /api/integrations — integrações com ambiente, modo debug e o último status do teste de conexão. */
export const GET = protectRoute(handleGet)
async function handleGet() {
    try {
        const data = (await listIntegrations()).filter(item => canSeeIntegration(currentAccess().effective, item.id))
        return NextResponse.json({ success: true, data })
    } catch (error) {
        logApiError({ route: "/api/integrations", method: "GET", error })
        return NextResponse.json({ success: false, error: "Erro ao listar integrações" }, { status: 500 })
    }
}
