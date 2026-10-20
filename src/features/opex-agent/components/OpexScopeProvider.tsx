"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
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

/**
 * Outro escopo para os mesmos componentes e hooks do chat (ex.: a entrevista do Agente
 * Entrevistador, em `/api/interview`, com as mesmas rotas de sessão, stream e arquivos).
 */
const ScopeOverride = createContext<OpexUiScope | null>(null)

export function OpexScopeOverride({ value, children }: { value: OpexUiScope; children: ReactNode }) {
    return <ScopeOverride.Provider value={value}>{children}</ScopeOverride.Provider>
}

export function useOpexScope(): OpexUiScope {
    const override = useContext(ScopeOverride)
    const owner = useOwnerScope()
    return override ?? owner
}

function useOwnerScope(): OpexUiScope {
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
