import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { listCalendarEvents } from "@/features/calendar/server/range"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/calendar/events?from=&to=&businessId=&types= — eventos do calendário (prazos, períodos, pedidos abertos, horas e Google). */
export const GET = withRoute(async ({ req }) => ok(await listCalendarEvents(currentAccess(), Object.fromEntries(req.nextUrl.searchParams))))
