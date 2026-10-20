import { isIntegrationId } from "@/lib/integrations/catalog"
import { appChannel, opexChannel } from "./channel-names"
import { can } from "@/features/access/catalog"

/** Base pública: somente canais conhecidos do app e das integrações podem ser assinados. */
export function isChannelAuthorized(channel: string, permissions: ReadonlySet<string>, userId?: string): boolean {
    if (!can(permissions, "admin.access")) return false
    if (channel === appChannel()) return permissions.has("*")
    // Agente Opex: somente o canal do próprio usuário real (sessões privadas).
    if (userId && channel === opexChannel(userId)) return can(permissions, "opex.use")
    const prefix = "private-integration-"
    const id = channel.slice(prefix.length)
    return channel.startsWith(prefix) && isIntegrationId(id) && can(permissions, `integrations.${id}.view`)
}
