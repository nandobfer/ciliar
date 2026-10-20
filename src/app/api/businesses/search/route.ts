import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { searchAllBusinesses } from "@/features/businesses/server/businesses"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/search?q=&status= — suporte (`businesses.view_all`): negócios de todos os usuários, auditado. */
export const GET = withRoute(async ({ req }) => {
    const status = req.nextUrl.searchParams.get("status")
    return ok(await searchAllBusinesses(currentAccess(), { q: req.nextUrl.searchParams.get("q")?.slice(0, 120) ?? "", status: status === "active" || status === "archived" ? status : "all" }))
})
