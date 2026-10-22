import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { getPortfolio, updatePortfolioSettings } from "@/features/portfolio/server/portfolio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/portfolio — editor: configuração, rascunho, publicado, conteúdo disponível e mídia (o dono abre e cria; suporte só lê, auditado). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getPortfolio(currentAccess(), params.id)))

/** PATCH /api/businesses/[id]/portfolio — indexação pelos buscadores (`version` otimista). */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => ok(await updatePortfolioSettings(currentAccess(), params.id, await req.json().catch(() => null))))
