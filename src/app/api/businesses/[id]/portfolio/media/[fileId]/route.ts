import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { deletePortfolioMedia } from "@/features/portfolio/server/media"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** DELETE /api/businesses/[id]/portfolio/media/[fileId] — exclui a imagem da mídia (recusado se estiver em uso). */
export const DELETE = withRoute<{ id: string; fileId: string }>(async ({ params }) => ok(await deletePortfolioMedia(currentAccess(), params.id, params.fileId)))
