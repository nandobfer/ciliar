import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { syncGoogleNow } from "@/features/calendar/server/google/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/calendar/google/sync — "Sincronizar agora". */
export const POST = withRoute(async () => ok(await syncGoogleNow(currentAccess())))
