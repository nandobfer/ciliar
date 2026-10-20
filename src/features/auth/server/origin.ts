import { DomainError } from "@/lib/api/route"

export function appOrigin() {
    const configured = process.env.APP_ORIGIN || process.env.AUTH_URL || process.env.NEXT_PUBLIC_APP_URL
    if (!configured && process.env.NODE_ENV === "production") throw new DomainError(503, "Configure APP_ORIGIN para autenticação")
    return new URL(configured || `http://localhost:${process.env.PORT || "3101"}`).origin
}
export function assertMutationOrigin(request: Request, requireMarker = true) {
    if (request.headers.get("origin") !== appOrigin() || (requireMarker && request.headers.get("x-ciliar-request") !== "1")) {
        throw new DomainError(403, "Origem da requisição não autorizada", "INVALID_ORIGIN")
    }
}
