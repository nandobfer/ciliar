import { ok } from "@/lib/api/responses"
import { parseBody } from "@/lib/api/route"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { scopeOfAccess } from "@/features/opex-agent/server/scope"
import { updateOpexSessionSchema } from "@/features/opex-agent/schemas"
import { deleteSession, getSessionDetail, updateSession } from "@/features/opex-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/opex/sessions/[id] — sessão com as mensagens gravadas. */
export const GET = withRoute<{ id: string }>(async ({ params }) => ok(await getSessionDetail(params.id, scopeOfAccess(currentAccess()))))

/** PATCH /api/opex/sessions/[id] — renomeia (título passa a ser manual) ou arquiva. */
export const PATCH = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, updateOpexSessionSchema)
    if (!body.ok) return body.response
    return ok(await updateSession(params.id, body.data, currentAccess().userId, scopeOfAccess(currentAccess())))
})

/** DELETE /api/opex/sessions/[id] — exclui a sessão, as mensagens, as ações pendentes e os arquivos (storage + metadados). */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => {
    await deleteSession(params.id, currentAccess().userId, scopeOfAccess(currentAccess()))
    return ok({ id: params.id })
})
