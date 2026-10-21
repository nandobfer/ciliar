import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { paymentMethodSuggestions } from "@/features/works/server/works"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/works/payment-methods — formas de pagamento já usadas pelo dono (sugestões do Pago). */
export const GET = withRoute(async () => ok(await paymentMethodSuggestions(currentAccess())))
