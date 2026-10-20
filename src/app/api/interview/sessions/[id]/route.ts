import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { getInterviewDetail } from "@/features/businesses/server/interview/state"
import { discardInterview } from "@/features/businesses/server/interview/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/interview/sessions/[id] — mensagens da entrevista (formato do chat do Agente Opex). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getInterviewDetail(params.id, currentAccess())))

/** DELETE /api/interview/sessions/[id] — descarta (só com outro negócio ativo; 409 `INTERVIEW_REQUIRED`). */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => ok(await discardInterview(params.id, currentAccess())))
