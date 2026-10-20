import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { archiveBusiness } from "@/features/businesses/server/businesses"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/archive — arquiva (some do seletor; não conta no limite). */
export const POST = withRoute<{ id: string }>(async ({ params }) => ok(await archiveBusiness(currentAccess(), params.id)))
