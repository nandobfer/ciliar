"use client"

import { usePermissions } from "@nandobfer/perfix/react"

/**
 * `opex.technical` ("Ver informações técnicas"): modelo, tokens, duração, raciocínio e os detalhes das
 * ferramentas em todo chat de agente do Ciliar. Só na interface: a API envia os dados completos.
 */
export function useOpexTechnicalDetails(): boolean {
    return usePermissions().can("opex.technical")
}
