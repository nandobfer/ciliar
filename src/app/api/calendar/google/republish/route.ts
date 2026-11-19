import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { republishGoogle } from "@/features/calendar/server/google/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/calendar/google/republish — recria no Google os eventos excluídos lá ({ all: true } ou { kind, id }). */
export const POST = withRoute(async ({ req }) => ok(await republishGoogle(currentAccess(), await req.json().catch(() => null))))
