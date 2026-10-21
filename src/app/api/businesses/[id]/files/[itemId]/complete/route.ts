import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { completeBusinessFile } from "@/features/businesses/server/files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/files/[itemId]/complete — confirma o envio (tamanho real e limites). */
export const POST = withRoute<{ id: string; itemId: string }>(async ({ params }) => ok(await completeBusinessFile(currentAccess(), params.id, params.itemId)))
