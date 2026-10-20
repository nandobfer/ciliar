/**
 * Escopo do Agente Opex (módulo PURO). No Ciliar as sessões são privadas do usuário **real**
 * autenticado: o canal de tempo real e as abas guardadas no navegador levam o id dele. Simular outro
 * perfil/usuário ("Visualizar como") não troca o dono das sessões, só limita as ferramentas.
 */

import { OPEX_CHANNEL_PREFIX } from "@/lib/pusher/channel-names"
import { OPEX_TABS_STORAGE_KEY } from "./constants"

/** `private-opex-{userId}` → `userId` (ou `null` se não for um canal do agente). */
export function parseOpexUserChannel(channel: string): string | null {
    if (!channel.startsWith(OPEX_CHANNEL_PREFIX)) return null
    const userId = channel.slice(OPEX_CHANNEL_PREFIX.length)
    return userId || null
}

/** Abas abertas: separadas por usuário real. */
export function opexTabsStorageKey(userId: string): string {
    return `${OPEX_TABS_STORAGE_KEY}:${userId}`
}
