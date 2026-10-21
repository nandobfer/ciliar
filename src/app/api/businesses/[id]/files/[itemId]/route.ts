import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { businessFileContent, deletePendingBusinessFile } from "@/features/businesses/server/files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/files/[itemId]?download=1 — conteúdo do arquivo (dono ou suporte). */
export const GET = withRoute<{ id: string; itemId: string }>(async ({ req, params }) => businessFileContent(currentAccess(), params.id, params.itemId, { download: req.nextUrl.searchParams.get("download") === "1" }))

/** DELETE /api/businesses/[id]/files/[itemId] — remove um envio ainda não usado. */
export const DELETE = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await deletePendingBusinessFile(currentAccess(), params.id, params.itemId)))
