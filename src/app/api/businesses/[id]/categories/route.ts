import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { categorySuggestions } from "@/features/businesses/server/items"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/businesses/[id]/categories?kind=activities|documents — categorias já usadas no negócio. */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => ok(await categorySuggestions(currentAccess(), params.id, req.nextUrl.searchParams.get("kind") === "documents" ? "documents" : "activities")))
