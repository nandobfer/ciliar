"use client"
import { createContext, useContext } from "react"
import { usePermissions } from "@nandobfer/perfix/react"
import type { IntegrationId } from "@/lib/integrations/catalog"

export const IntegrationAccess = createContext<IntegrationId | null>(null)
export function useIntegrationPermission(action: string) {
    const id = useContext(IntegrationAccess)
    const { can } = usePermissions()
    return id !== null && can(`integrations.${id}.${action}`)
}
