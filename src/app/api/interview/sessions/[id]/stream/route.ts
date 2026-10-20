import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { openInterviewStream } from "@/features/businesses/server/interview/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/interview/sessions/[id]/stream — NDJSON: `snapshot` + resposta ao vivo (`ping` a cada 15 s). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => openInterviewStream(params.id, req.signal, currentAccess()))
