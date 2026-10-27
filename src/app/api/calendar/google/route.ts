import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { disconnectGoogle, getGoogleConnection } from "@/features/calendar/server/google/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/calendar/google — estado da conexão do Google Agenda do dono efetivo (nunca tokens). */
export const GET = withRoute(async () => ok(await getGoogleConnection(currentAccess())))

/** DELETE /api/calendar/google — desconectar: revoga o acesso e apaga os tokens (os eventos ficam no Google). */
export const DELETE = withRoute(async () => ok(await disconnectGoogle(currentAccess())))
