import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { checkDeadlineConflict } from "@/features/calendar/server/conflict"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/calendar/conflict?businessId=&dueDate=&estimatedMinutes=&orderId=&workId= — alerta de conflito de prazo (nunca bloqueia). */
export const GET = withRoute(async ({ req }) => ok(await checkDeadlineConflict(currentAccess(), Object.fromEntries(req.nextUrl.searchParams))))
