import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { getInterviewerSettings, saveInterviewerSettings } from "@/features/businesses/server/interviewer-settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/business-interviewer — configuração do Agente Entrevistador, roteiro vigente e histórico de versões. */
export const GET = withRoute(async () => ok(await getInterviewerSettings()))

/** PUT /api/ai/features/business-interviewer — salva provedor, modelo, variante e instruções. */
export const PUT = withRoute(async ({ req }) => ok(await saveInterviewerSettings(currentAccess(), await req.json().catch(() => null))))
