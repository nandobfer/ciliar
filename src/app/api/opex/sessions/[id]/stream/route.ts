import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { scopeOfAccess } from "@/features/opex-agent/server/scope"
import { openSessionStream } from "@/features/opex-agent/server/stream"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/opex/sessions/[id]/stream — NDJSON: `snapshot` + resposta ao vivo (`ping` a cada 15 s). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => openSessionStream(params.id, req.signal, scopeOfAccess(currentAccess())))
