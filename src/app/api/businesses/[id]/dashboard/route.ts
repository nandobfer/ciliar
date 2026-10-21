import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { parseInput } from "@/features/access/server/commands"
import { businessDashboardPeriodSchema, DEFAULT_BUSINESS_DASHBOARD_PERIOD } from "@/features/businesses/dashboard-period"
import { getBusinessDashboard } from "@/features/businesses/server/dashboard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/dashboard?period=month|3m|6m|12m — indicadores, metas e gráficos (fuso do navegador). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => {
    const period = parseInput(businessDashboardPeriodSchema, req.nextUrl.searchParams.get("period") ?? DEFAULT_BUSINESS_DASHBOARD_PERIOD)
    return ok(await getBusinessDashboard(currentAccess(), params.id, { period }))
})
