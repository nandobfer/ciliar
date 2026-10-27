import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { connectOriginOf, startGoogleConnect } from "@/features/calendar/server/google/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/calendar/google/connect — URL de autorização do Google (o navegador navega até ela). A
 * `redirect_uri` usa o endereço de acesso quando ele é permitido (CIL-6), senão o `APP_ORIGIN`.
 */
export const POST = withRoute(async ({ req }) => ok(await startGoogleConnect(currentAccess(), await req.json().catch(() => ({})), await connectOriginOf(req.headers, req.url))))
