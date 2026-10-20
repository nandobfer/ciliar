import { created } from "@/lib/api/responses"
import { parseBody } from "@/lib/api/route"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { sendInterviewMessageSchema } from "@/features/businesses/schemas"
import { sendInterviewMessage } from "@/features/businesses/server/interview/runner"
import { scopeOf } from "@/features/businesses/server/interview/state"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/interview/sessions/[id]/messages — resposta do usuário (texto e/ou a imagem confirmada); o turno segue em segundo plano. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, sendInterviewMessageSchema)
    if (!body.ok) return body.response
    return created(await sendInterviewMessage(params.id, body.data, scopeOf(currentAccess())))
})
