import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { checkPortfolioSlug, updatePortfolioSlug } from "@/features/portfolio/server/portfolio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/portfolio/slug?check= — confere formato, reservados e disponibilidade. */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => ok(await checkPortfolioSlug(currentAccess(), params.id, req.nextUrl.searchParams.get("check") ?? "")))

/** PUT /api/businesses/[id]/portfolio/slug — troca o endereço (o antigo deixa de funcionar; `version` otimista). */
export const PUT = withRoute<{ id: string }>(async ({ req, params }) => ok(await updatePortfolioSlug(currentAccess(), params.id, await req.json().catch(() => null))))
