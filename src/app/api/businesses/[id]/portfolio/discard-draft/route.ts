import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { discardPortfolioDraft } from "@/features/portfolio/server/portfolio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/portfolio/discard-draft — volta o rascunho para a página publicada. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => ok(await discardPortfolioDraft(currentAccess(), params.id, await req.json().catch(() => null))))
