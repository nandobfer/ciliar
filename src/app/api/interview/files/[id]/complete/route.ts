import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { completeInterviewFile } from "@/features/businesses/server/interview/files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/interview/files/[id]/complete — confirma o envio (confere a imagem no storage). */
export const POST = withRoute<{ id: string }>(async ({ params }) => ok(await completeInterviewFile(params.id, currentAccess())))
