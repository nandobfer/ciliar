import { NextResponse } from "next/server"
import { DomainError } from "@/lib/api/route"
import { currentAccess } from "@/features/access/server/context"
import { protectRoute } from "@/features/access/server/protect-route"
import { getLegalOverview, getLegalVersion, publishLegalVersion } from "@/features/platform/server/legal"

/** GET /api/platform/legal — vigente + histórico; `?version=N` devolve o texto de uma versão. */
export const GET = protectRoute(async (request) => {
    const raw = request.nextUrl.searchParams.get("version")
    if (raw === null) return NextResponse.json({ success: true, data: await getLegalOverview() })
    const version = Number(raw)
    if (!Number.isInteger(version) || version < 1) throw new DomainError(400, "Versão inválida", "VALIDATION_ERROR")
    const found = await getLegalVersion(version)
    if (!found) throw new DomainError(404, "Versão não encontrada", "NOT_FOUND")
    return NextResponse.json({ success: true, data: found })
})

/** POST /api/platform/legal — publica uma nova versão; todos os usuários deverão aceitá-la. */
export const POST = protectRoute(async (request) => NextResponse.json({ success: true, data: await publishLegalVersion(currentAccess(), await request.json().catch(() => null)) }, { status: 201 }))
