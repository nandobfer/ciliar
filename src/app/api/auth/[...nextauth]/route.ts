import { NextRequest } from "next/server"
import { handlers } from "@/auth"
import { appOrigin, assertMutationOrigin } from "@/features/auth/server/origin"
import { accessErrorResponse } from "@/features/access/server/protect-route"
import { checkRateLimit } from "@/features/auth/server/rate-limit"

async function handle(request: NextRequest) {
    try {
        if (request.method === "POST") {
            assertMutationOrigin(request, false)
            if (!request.nextUrl.pathname.endsWith("/signout")) checkRateLimit("auth:global", Date.now(), 200)
        }
        const target = new URL(request.nextUrl.pathname + request.nextUrl.search, appOrigin())
        const canonical = new NextRequest(target, request)
        canonical.headers.delete("x-forwarded-host")
        canonical.headers.set("host", target.host)
        const response = await handlers[request.method === "POST" ? "POST" : "GET"](canonical)
        response.headers.set("Cache-Control", "no-store")
        return response
    } catch (error) { return accessErrorResponse(error) }
}
export const GET = handle
export const POST = handle
