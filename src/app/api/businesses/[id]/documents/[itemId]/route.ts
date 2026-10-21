import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { getDocument, updateDocument, deleteDocument } from "@/features/businesses/server/documents"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/documents/[itemId] — documento. */
export const GET = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await getDocument(currentAccess(), params.id, params.itemId)))

/** PATCH /api/businesses/[id]/documents/[itemId] — edita (documento ativo; `version` otimista). */
export const PATCH = withRoute<{ id: string; itemId: string }>(async ({ req, params }) => ok(await updateDocument(currentAccess(), params.id, params.itemId, await req.json().catch(() => null))))

/** DELETE /api/businesses/[id]/documents/[itemId] — exclusão definitiva de um item arquivado (irreversível). */
export const DELETE = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await deleteDocument(currentAccess(), params.id, params.itemId)))
