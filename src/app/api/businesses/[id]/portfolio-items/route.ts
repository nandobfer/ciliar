import { ok, created } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { itemStatusQuerySchema } from "@/features/businesses/space-schemas"
import { createPortfolioItem, listPortfolioItems } from "@/features/portfolio/server/items"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/portfolio-items?status= — itens avulsos do portfólio (dono; suporte auditado). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => ok(await listPortfolioItems(currentAccess(), params.id, itemStatusQuerySchema.parse(req.nextUrl.searchParams.get("status") ?? "all"))))

/** POST /api/businesses/[id]/portfolio-items — cria (só o dono, negócio ativo). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => created(await createPortfolioItem(currentAccess(), params.id, await req.json().catch(() => null))))
