import { created } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { currentAccess } from "@/features/access/server/context"
import { scopeOfAccess } from "@/features/opex-agent/server/scope"
import { completeOpexFile } from "@/features/opex-agent/server/files"
import { loadOpexSettings } from "@/features/opex-agent/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/opex/files/[id]/complete — confirma o envio (HeadObject, confere o tamanho e promove). Idempotente. */
export const POST = withRoute<{ id: string }>(async ({ params }) => {
    const { settings } = await loadOpexSettings()
    return created(await completeOpexFile(params.id, settings.files, scopeOfAccess(currentAccess())))
})
