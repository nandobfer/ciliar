import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { deletePortfolioItem, getPortfolioItem, updatePortfolioItem } from "@/features/portfolio/server/items"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/portfolio-items/[itemId] — item avulso. */
export const GET = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await getPortfolioItem(currentAccess(), params.id, params.itemId)))

/** PATCH /api/businesses/[id]/portfolio-items/[itemId] — edita (item ativo; `version` otimista). */
export const PATCH = withRoute<{ id: string; itemId: string }>(async ({ req, params }) => ok(await updatePortfolioItem(currentAccess(), params.id, params.itemId, await req.json().catch(() => null))))

/** DELETE /api/businesses/[id]/portfolio-items/[itemId] — exclusão definitiva de um item arquivado (irreversível). */
export const DELETE = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await deletePortfolioItem(currentAccess(), params.id, params.itemId)))
