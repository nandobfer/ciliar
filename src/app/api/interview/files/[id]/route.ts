import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { deletePendingInterviewFile, interviewFileContent } from "@/features/businesses/server/interview/files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/interview/files/[id] — imagem enviada na entrevista. */
export const GET = withRoute<{ id: string }>(async ({ params }) => interviewFileContent(params.id, currentAccess()))

/** DELETE /api/interview/files/[id] — remove a imagem ainda não enviada numa mensagem. */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => {
    await deletePendingInterviewFile(params.id, currentAccess())
    return ok({ id: params.id })
})
