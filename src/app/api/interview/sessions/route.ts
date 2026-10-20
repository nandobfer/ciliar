import { created } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { startInterview } from "@/features/businesses/server/interview/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/interview/sessions — começa (ou retoma) a entrevista do novo negócio. 409
 * `BUSINESS_LIMIT_REACHED` no limite do perfil; 409 `INTERVIEW_UNAVAILABLE` com a IA indisponível.
 */
export const POST = withRoute(async () => created(await startInterview(currentAccess())))
