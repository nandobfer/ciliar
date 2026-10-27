import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { startGoogleConnect } from "@/features/calendar/server/google/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/calendar/google/connect — URL de autorização do Google (o navegador navega até ela). */
export const POST = withRoute(async ({ req }) => ok(await startGoogleConnect(currentAccess(), await req.json().catch(() => ({})))))
