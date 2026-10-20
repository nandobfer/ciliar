import { ok } from "@/lib/api/responses"
import { parseBody } from "@/lib/api/route"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { summaryFeatureSchema } from "@/features/ai/schemas"
import { getSummarySettings, saveSummarySettings } from "@/features/ai/server/summary"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/summary — configuração do uso "Resumo" e se pode ser usado. */
export const GET = withRoute(async () => ok(await getSummarySettings()))

/** PUT /api/ai/features/summary — salva (confere provedor, modelo e variante no catálogo). */
export const PUT = withRoute(async ({ req }) => {
    const body = await parseBody(req, summaryFeatureSchema)
    if (!body.ok) return body.response
    return ok(await saveSummarySettings(body.data, currentAccess().userId))
})
