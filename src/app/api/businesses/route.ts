import { ok } from "@/lib/api/responses"
import { DomainError } from "@/lib/api/route"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { listBusinesses } from "@/features/businesses/server/businesses"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STATUSES = ["active", "archived", "all"] as const

/**
 * GET /api/businesses?status=active|archived|all&ownerId= — negócios do dono efetivo e as vagas do
 * limite. `ownerId` de outro usuário exige `businesses.view_all` (somente leitura, auditado).
 */
export const GET = withRoute(async ({ req }) => {
    const status = req.nextUrl.searchParams.get("status") ?? "all"
    if (!(STATUSES as readonly string[]).includes(status)) throw new DomainError(400, "Situação inválida", "VALIDATION_ERROR")
    const ownerId = req.nextUrl.searchParams.get("ownerId")
    if (ownerId && !/^[a-f\d]{24}$/i.test(ownerId)) throw new DomainError(400, "Usuário inválido", "VALIDATION_ERROR")
    return ok(await listBusinesses(currentAccess(), { status: status as (typeof STATUSES)[number], ownerId }))
})
