import { ok, created } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { listDocuments, createDocument } from "@/features/businesses/server/documents"
import { itemStatusQuerySchema } from "@/features/businesses/space-schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/documents?status= — lista (dono; suporte com `businesses.view_all`, auditado). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => ok(await listDocuments(currentAccess(), params.id, itemStatusQuerySchema.parse(req.nextUrl.searchParams.get("status") ?? "all"))))

/** POST /api/businesses/[id]/documents — cria (documento; só o dono, negócio ativo). */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => created(await createDocument(currentAccess(), params.id, await req.json().catch(() => null))))
