import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { updateGoogleSettings } from "@/features/calendar/server/google/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH /api/calendar/google/settings — agenda de publicação e agendas lidas. */
export const PATCH = withRoute(async ({ req }) => ok(await updateGoogleSettings(currentAccess(), await req.json().catch(() => null))))
