import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { currentInterview, interviewStatus } from "@/features/businesses/server/interview/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/interview — disponibilidade do Entrevistador e a entrevista em andamento do dono efetivo. */
export const GET = withRoute(async () => {
    const access = currentAccess()
    const [status, current] = await Promise.all([interviewStatus(), currentInterview(access)])
    return ok({ status, current })
})
