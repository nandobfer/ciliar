import { ok } from "@/lib/api/responses"
import { withProtectedRoute as withRoute } from "@/features/access/server/protect-route"
import { getOpexStatus } from "@/features/opex-agent/server/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/opex/status — disponibilidade, modelo e limites dos arquivos para o painel do chat (`opex.use`). */
export const GET = withRoute(async () => ok(await getOpexStatus()))
