import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { interviewProgress } from "@/features/businesses/server/interview/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/interview/sessions/[id]/progress — perguntas do roteiro (pendente, respondida, pulada) e o valor coletado. */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await interviewProgress(params.id, currentAccess())))
