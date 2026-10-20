import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"
import { DomainError, withRoute, type RouteArgs } from "@/lib/api/route"
import { logger } from "@/lib/logger"
import { assertMutationOrigin } from "@/features/auth/server/origin"
import { resolveAccess, requirePermissions } from "./access"
import { requestAccess } from "./context"
import { routePermissions } from "./policy"

export function accessErrorResponse(error: unknown) {
    if (error instanceof DomainError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } })
    logger.error({ err: error, module: "access" }, "Falha na operação protegida")
    return NextResponse.json({ success: false, error: "Não foi possível concluir a operação" }, { status: 500, headers: { "Cache-Control": "no-store" } })
}

/** Proteção no Route Handler, independente de middleware e da navegação do navegador. */
export function protectRoute<P>(handler: (request: NextRequest, context: P) => Promise<Response>) {
    return async (request: NextRequest, routeContext: P = {} as P) => {
        try {
            const session = await auth()
            if (!session?.user?.id) throw new DomainError(401, "Entre para continuar", "UNAUTHORIZED")
            const path = request.nextUrl.pathname
            if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertMutationOrigin(request)
            const context = await resolveAccess(session.user.id, request.headers.get("x-perfix-view-as") ?? "none", null, session.user.sessionVersion)
            const ownAccount = path === "/api/me" || path === "/api/me/password"
            if (context.mustChangePassword && !ownAccount) throw new DomainError(403, "Troque sua senha para continuar", "PASSWORD_CHANGE_REQUIRED")
            const keys = routePermissions(path, request.method)
            if (!ownAccount && !path.startsWith("/api/access/view-as")) requirePermissions(context, "admin.access")
            requirePermissions(context, ...keys)
            const response = await requestAccess.run(context, () => handler(request, routeContext))
            response.headers.set("Cache-Control", "no-store")
            return response
        } catch (error) { return accessErrorResponse(error) }
    }
}

export function withProtectedRoute<P extends Record<string, string> = Record<string, never>>(handler: (args: RouteArgs<P>) => Promise<Response>) {
    return protectRoute(withRoute(handler))
}
