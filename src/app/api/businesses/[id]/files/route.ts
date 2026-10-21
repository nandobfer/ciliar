import { created } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { reserveBusinessFile } from "@/features/businesses/server/files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/businesses/[id]/files — reserva o envio (PUT assinado) de documento, anexo ou logo. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => created(await reserveBusinessFile(currentAccess(), params.id, await req.json().catch(() => null))))
