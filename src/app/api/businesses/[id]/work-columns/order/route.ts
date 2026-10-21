import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { reorderWorkColumns } from "@/features/works/server/columns"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PUT /api/businesses/[id]/work-columns/order — nova ordem (as fixas não mudam). */
export const PUT = withRoute<{ id: string }>(async ({ req, params }) => ok(await reorderWorkColumns(currentAccess(), params.id, await req.json().catch(() => null))))
