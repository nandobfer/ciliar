import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { deleteWorkColumn, updateWorkColumn } from "@/features/works/server/columns"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH /api/businesses/[id]/work-columns/[key] — renomeia/edita uma coluna customizada. */
export const PATCH = withRoute<{ id: string; key: string }>(async ({ req, params }) => ok(await updateWorkColumn(currentAccess(), params.id, params.key, await req.json().catch(() => null))))

/** DELETE /api/businesses/[id]/work-columns/[key] — exclui uma coluna customizada vazia. */
export const DELETE = withRoute<{ id: string; key: string }>(async ({ params }) => ok(await deleteWorkColumn(currentAccess(), params.id, params.key)))
