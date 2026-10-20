import { NextResponse } from "next/server"
import { buildPublicApiSpec } from "@/features/public-api/openapi/spec"

/**
 * GET /api/openapi.json — especificação OpenAPI 3.1 da API interna.
 *
 * Pública (sem token): expõe só o contrato, nenhum dado. É a `swaggerUrl` gerenciada
 * da integração API interna em Integrações.
 */
export const dynamic = "force-dynamic"

export const GET = protectRoute(async () => {
    return NextResponse.json(buildPublicApiSpec(), {
        headers: { "Cache-Control": "no-store" },
    })
})
import { protectRoute } from "@/features/access/server/protect-route"
