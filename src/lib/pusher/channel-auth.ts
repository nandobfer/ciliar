import { isIntegrationId } from "@/lib/integrations/catalog"
import { appChannel, businessesChannel, opexChannel } from "./channel-names"
import { can } from "@/features/access/catalog"

/** Base pública: somente canais conhecidos do app e das integrações podem ser assinados. */
export function isChannelAuthorized(channel: string, permissions: ReadonlySet<string>, userId?: string): boolean {
    // Agente Opex e Negócios: somente o canal do próprio usuário real (não exigem o painel).
    if (userId && channel === opexChannel(userId)) return can(permissions, "opex.use")
    if (userId && channel === businessesChannel(userId)) return can(permissions, "businesses.use")
    if (!can(permissions, "admin.access")) return false
    if (channel === appChannel()) return permissions.has("*")
    const prefix = "private-integration-"
    const id = channel.slice(prefix.length)
    return channel.startsWith(prefix) && isIntegrationId(id) && can(permissions, `integrations.${id}.view`)
}
