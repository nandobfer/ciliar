import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"
import { DomainError, withRoute, type RouteArgs } from "@/lib/api/route"
import { logger } from "@/lib/logger"
import { normalizeTimeZone, TIME_ZONE_HEADER } from "@/lib/timezone"
import { assertMutationOrigin } from "@/features/auth/server/origin"
import { resolveAccess, requirePermissions } from "./access"
import { requestAccess } from "./context"
import { requiresPanel, routePermissions } from "./policy"
import { isOnboardingRoute, mayRequireOnboarding, onboardingState } from "@/features/businesses/server/onboarding"

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
            context.timeZone = normalizeTimeZone(request.headers.get(TIME_ZONE_HEADER))
            // Própria conta: sessão e aceite dos termos. Não exige `admin.access` (cadastro público).
            const ownAccount = path === "/api/me" || path === "/api/me/legal" || path === "/api/me/legal/accept"
            if (context.legalAcceptanceRequired && !ownAccount) throw new DomainError(403, "Aceite os termos de uso e a política de privacidade para continuar", "TERMS_ACCEPTANCE_REQUIRED")
            const keys = routePermissions(path, request.method)
            // Onboarding obrigatório (M1): sem negócio ativo, só a entrevista (e a própria conta) até concluir.
            if (mayRequireOnboarding(context) && !isOnboardingRoute(path, request.method) && (await onboardingState(context)).required) {
                throw new DomainError(403, "Conclua a entrevista do seu primeiro negócio para continuar", "ONBOARDING_REQUIRED")
            }
            if (requiresPanel(path)) requirePermissions(context, "admin.access")
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
