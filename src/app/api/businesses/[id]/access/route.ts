import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { recordBusinessAccess } from "@/features/businesses/server/businesses"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/access — registra o último acesso do usuário real (ordena o seletor do cabeçalho). */
export const POST = withRoute<{ id: string }>(async ({ params }) => ok(await recordBusinessAccess(currentAccess(), params.id)))
