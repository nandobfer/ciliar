import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { listWorks } from "@/features/works/server/works"
import { workListQuerySchema } from "@/features/works/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/works?businessId=&clientId=&status= — visão geral dos trabalhos de todos os negócios do dono efetivo. */
export const GET = withRoute(async ({ req }) => ok(await listWorks(currentAccess(), workListQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams)))))
