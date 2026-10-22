import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { savePortfolioDraft } from "@/features/portfolio/server/portfolio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PUT /api/businesses/[id]/portfolio/draft — salvamento automático do rascunho (`blocks`, `draftVersion`). */
export const PUT = withRoute<{ id: string }>(async ({ req, params }) => ok(await savePortfolioDraft(currentAccess(), params.id, await req.json().catch(() => null))))
