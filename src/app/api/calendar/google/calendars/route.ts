import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { listGoogleCalendars } from "@/features/calendar/server/google/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/calendar/google/calendars — agendas da conta conectada. */
export const GET = withRoute(async () => ok(await listGoogleCalendars(currentAccess())))
