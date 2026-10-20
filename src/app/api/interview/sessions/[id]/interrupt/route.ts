import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { interruptInterview } from "@/features/businesses/server/interview/runner"
import { scopeOf } from "@/features/businesses/server/interview/state"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/interview/sessions/[id]/interrupt — para a resposta em andamento. */
export const POST = withRoute<{ id: string }>(async ({ params }) => {
    await interruptInterview(params.id, scopeOf(currentAccess()))
    return ok({ id: params.id })
})
