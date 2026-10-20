import { ok } from "@/lib/api/responses"
import { DomainError } from "@/lib/api/route"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { getInterviewScriptVersion, saveInterviewScript } from "@/features/businesses/server/interviewer-settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/features/business-interviewer/script?version=N — uma versão do roteiro. */
export const GET = withRoute(async ({ req }) => {
    const version = Number(req.nextUrl.searchParams.get("version"))
    if (!Number.isInteger(version) || version < 0) throw new DomainError(400, "Versão inválida", "VALIDATION_ERROR")
    const found = await getInterviewScriptVersion(version)
    if (!found) throw new DomainError(404, "Versão não encontrada", "NOT_FOUND")
    return ok(found)
})

/** PUT /api/ai/features/business-interviewer/script — grava uma nova versão do roteiro (`version` = vigente na abertura). */
export const PUT = withRoute(async ({ req }) => ok(await saveInterviewScript(currentAccess(), await req.json().catch(() => null))))
