import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { startOpeningTurn } from "@/features/businesses/server/interview/runner"
import { scopeOf } from "@/features/businesses/server/interview/state"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/interview/sessions/[id]/opening — refaz a abertura do entrevistador (quando a primeira fala falhou). */
export const POST = withRoute<{ id: string }>(async ({ params }) => {
    await startOpeningTurn(params.id, scopeOf(currentAccess()))
    return ok({ id: params.id })
})
