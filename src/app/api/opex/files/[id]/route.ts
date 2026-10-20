import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { scopeOfAccess } from "@/features/opex-agent/server/scope"
import { deletePendingOpexFile, opexFileContent } from "@/features/opex-agent/server/files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/opex/files/[id] — conteúdo do storage (imagem, áudio e vídeo inline; `?download=1` sempre baixa; aceita `Range`). */
export const GET = withRoute<{ id: string }>(async ({ req, params }) =>
    opexFileContent(params.id, { download: req.nextUrl.searchParams.get("download") === "1", range: req.headers.get("range") ?? undefined }, scopeOfAccess(currentAccess())),
)

/** DELETE /api/opex/files/[id] — remove um arquivo ainda não enviado (409 `OPEX_FILE_SENT` se já foi numa mensagem). */
export const DELETE = withRoute<{ id: string }>(async ({ params }) => {
    await deletePendingOpexFile(params.id, scopeOfAccess(currentAccess()))
    return ok({ id: params.id })
})
