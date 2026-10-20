"use client"

import { useMemo } from "react"
import type { AxiosInstance } from "axios"
import { api } from "@/lib/api"
import { opexChannel } from "@/lib/pusher/channel-names"
import { useAppSession } from "@/features/access/components/AccessProvider"
import { OPEX_AI_TAB } from "../constants"
import { opexTabsStorageKey } from "../scope"

/**
 * Escopo da interface do Agente Opex. No Ciliar há um único escopo: o usuário **real** autenticado
 * (sessões privadas). Muda por usuário o canal do Pusher e as abas guardadas no navegador; o cache já
 * é isolado por identidade/permissões/simulação no `AccessProvider`.
 */

export interface OpexUiScope {
    kind: "owner"
    /** Prefixo das rotas, a partir de `/api`. */
    apiBase: string
    http: AxiosInstance
    /** Canal privado do Pusher (`private-opex-{userId}`). */
    channel: string
    /** Prefixo das chaves do TanStack Query. */
    queryPrefix: string
    tabsKey: string
    /** Onde configurar o agente (`null` sem permissão de ver a integração de IA). */
    settingsHref: string | null
    clientName: string | null
}

export const OWNER_OPEX_SETTINGS_HREF = `/integracoes/ia?aba=${OPEX_AI_TAB}`

export function useOpexScope(): OpexUiScope {
    const { session } = useAppSession()
    const userId = session?.user.id ?? "anonimo"
    const permissions = session?.access.permissions
    const canConfigure = Boolean(permissions?.includes("*") || permissions?.includes("integrations.ai.view"))
    return useMemo<OpexUiScope>(
        () => ({
            kind: "owner",
            apiBase: "/opex",
            http: api,
            channel: opexChannel(userId),
            queryPrefix: "opex-agent",
            tabsKey: opexTabsStorageKey(userId),
            settingsHref: canConfigure ? OWNER_OPEX_SETTINGS_HREF : null,
            clientName: null,
        }),
        [userId, canConfigure],
    )
}
