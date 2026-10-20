import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { businessLogoContent } from "@/features/businesses/server/businesses"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/logo — imagem da logo (dono ou suporte). */
export const GET = withRoute<{ id: string }>(async ({ params }) => businessLogoContent(currentAccess(), params.id))
