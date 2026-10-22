import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { addPortfolioMedia, listPortfolioMedia } from "@/features/portfolio/server/media"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/portfolio/media — imagens da mídia do portfólio. */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await listPortfolioMedia(currentAccess(), params.id)))

/** POST /api/businesses/[id]/portfolio/media — acrescenta à mídia os arquivos enviados (`purpose: media`). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => ok(await addPortfolioMedia(currentAccess(), params.id, await req.json().catch(() => null))))
