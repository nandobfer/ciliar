import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { businessLogoContent } from "@/features/businesses/server/businesses"
import { removeBusinessLogo, setBusinessLogo } from "@/features/businesses/server/space"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/logo — imagem da logo (dono ou suporte). */
export const GET = withRoute<{ id: string }>(async ({ params }) => businessLogoContent(currentAccess(), params.id))

/** PUT /api/businesses/[id]/logo — troca a logo por uma imagem enviada (`{ fileId }`, finalidade `logo`). */
export const PUT = withRoute<{ id: string }>(async ({ req, params }) => ok(await setBusinessLogo(currentAccess(), params.id, await req.json().catch(() => null))))

/** DELETE /api/businesses/[id]/logo — remove a logo. */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => ok(await removeBusinessLogo(currentAccess(), params.id)))
