import { ok, created } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { createClient, listClients } from "@/features/orders/server/clients"
import { clientStatusQuerySchema, objectIdSchema } from "@/features/orders/schemas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/clients?status=&businessId=&q= — clientes do dono efetivo (busca e filtro por negócio). */
export const GET = withRoute(async ({ req }) => {
    const params = req.nextUrl.searchParams
    const businessId = objectIdSchema.safeParse(params.get("businessId") ?? "")
    return ok(await listClients(currentAccess(), { status: clientStatusQuerySchema.parse(params.get("status") ?? "all"), businessId: businessId.success ? businessId.data : undefined, q: params.get("q") ?? undefined }))
})

/** POST /api/clients — cria um cliente (só o dono, `businesses.use`). */
export const POST = withRoute(async ({ req }) => created(await createClient(currentAccess(), await req.json().catch(() => null))))
