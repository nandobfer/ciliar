import { created } from "@/lib/api/responses"
import { parseBody } from "@/lib/api/route"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { reserveInterviewFileSchema } from "@/features/businesses/schemas"
import { reserveInterviewFile } from "@/features/businesses/server/interview/files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/interview/sessions/[id]/files — reserva o envio da imagem (logo/foto) e devolve o PUT assinado. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, reserveInterviewFileSchema)
    if (!body.ok) return body.response
    return created(await reserveInterviewFile(params.id, body.data, currentAccess()))
})
