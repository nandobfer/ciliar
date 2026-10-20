import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { deleteBusiness, getBusinessDetail, updateBusiness } from "@/features/businesses/server/businesses"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id] — ficha com as metas (dono; suporte com `businesses.view_all`, auditado). */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getBusinessDetail(currentAccess(), params.id)))

/** PATCH /api/businesses/[id] — edita a ficha (só o dono; `version` otimista). */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => ok(await updateBusiness(currentAccess(), params.id, await req.json().catch(() => null))))

/** DELETE /api/businesses/[id] — exclusão definitiva de um negócio arquivado (irreversível). */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => ok(await deleteBusiness(currentAccess(), params.id)))
