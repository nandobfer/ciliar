import { created, ok } from "@/lib/api/responses"
import { parseBody } from "@/lib/api/route"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { scopeOfAccess } from "@/features/opex-agent/server/scope"
import { createOpexSessionSchema } from "@/features/opex-agent/schemas"
import { sendMessage } from "@/features/opex-agent/server/runner"
import { createSession, listSessions } from "@/features/opex-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/opex/sessions — sessões do usuário real no Agente Opex, da mais recente para a mais antiga. */
export const GET = withRoute(async () => ok(await listSessions(scopeOfAccess(currentAccess()))))

/** POST /api/opex/sessions — cria a sessão e, com `text`, já envia a primeira mensagem. */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, createOpexSessionSchema)
    if (!body.ok) return body.response
    const scope = scopeOfAccess(currentAccess())
    const session = await createSession(scope.userId, scope)
    const message = body.data.text ? await sendMessage(session.id, { text: body.data.text }, scope) : null
    return created({ session, message })
})
