import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { scopeOfAccess } from "@/features/opex-agent/server/scope"
import { interruptSession } from "@/features/opex-agent/server/runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/opex/sessions/[id]/interrupt — para a resposta em andamento (a parte já gerada é mantida). */
export const POST = withRoute<{ id: string }>(async ({ params }) => {
    await interruptSession(params.id, scopeOfAccess(currentAccess()))
    return ok({ id: params.id })
})
