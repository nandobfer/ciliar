import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { businessInterviewTranscript } from "@/features/businesses/server/interview/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/interview — transcrição da entrevista que criou o negócio (dono ou suporte, auditado). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await businessInterviewTranscript(currentAccess(), params.id)))
