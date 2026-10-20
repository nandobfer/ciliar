import type { AccessContext } from "@/features/access/server/context"
import { dbConnect } from "@/lib/db"
import type { OnboardingDto } from "../types"
import { businessOwnerOf } from "./access"
import { businessModels } from "./models"

/**
 * Onboarding obrigatório (M1): quem tem `businesses.use` (nas permissões efetivas — inclusive as
 * simuladas) e nenhum negócio ativo fica preso à entrevista até concluí-la. O wildcard (`*`) não
 * conta como "ter o escopo Negócios": administradores nunca são forçados. Só o suporte
 * (`businesses.view_all` sem `use`) também não.
 */
export function mayRequireOnboarding(access: Pick<AccessContext, "effective">): boolean {
    return !access.effective.has("*") && access.effective.has("businesses.use")
}

export async function onboardingState(access: AccessContext): Promise<OnboardingDto> {
    if (!mayRequireOnboarding(access)) return { required: false, interviewId: null, archived: 0 }
    await dbConnect()
    const ownerId = businessOwnerOf(access)
    const models = businessModels()
    const active = await models.businesses.exists({ ownerId, status: "active" })
    if (active) return { required: false, interviewId: null, archived: 0 }
    const [archived, interview] = await Promise.all([
        models.businesses.countDocuments({ ownerId, status: "archived" }),
        models.interviews.findOne({ ownerId, status: "in_progress" }).select({ _id: 1 }).lean(),
    ])
    return { required: true, interviewId: interview?._id.toString() ?? null, archived }
}

/**
 * Rotas liberadas durante o onboarding obrigatório: a própria conta, os termos, a entrevista, a
 * restauração de um negócio arquivado (a tela oferece como alternativa), sair da simulação e o Pusher.
 */
export function isOnboardingRoute(path: string, method: string): boolean {
    if (path === "/api/me" || path.startsWith("/api/me/") || path.startsWith("/api/access/view-as") || path === "/api/pusher/auth") return true
    if (/^\/api\/interview(?:\/|$)/.test(path)) return true
    if (path === "/api/businesses" && method === "GET") return true
    if (/^\/api\/businesses\/[a-f\d]{24}\/restore$/i.test(path)) return true
    if (/^\/api\/businesses\/[a-f\d]{24}\/logo$/i.test(path) && method === "GET") return true
    return false
}
