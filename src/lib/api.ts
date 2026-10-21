import axios, { type AxiosInstance } from "axios"
import { withBasePath } from "@/lib/base-path"
import type { ApiResponse } from "@/lib/types/api"
import { getViewAsHeaderValue } from "@nandobfer/perfix/react"
import { browserTimeZone, TIME_ZONE_HEADER } from "@/lib/timezone"

/**
 * Cliente HTTP do navegador. `baseURL` é `/api` (com o subcaminho público, se houver): chame os
 * endpoints SEM prefixar `/api` (`api.get('/acme/campaigns')`).
 */
const api: AxiosInstance = axios.create({
    baseURL: withBasePath("/api"),
    headers: {
        "Content-Type": "application/json",
    },
})

api.interceptors.request.use(config => {
    if (!config.headers.has("x-perfix-view-as")) config.headers.set("x-perfix-view-as", getViewAsHeaderValue())
    config.headers.set("x-ciliar-request", "1")
    if (typeof window !== "undefined") config.headers.set(TIME_ZONE_HEADER, browserTimeZone())
    return config
})
api.interceptors.response.use(response => response, error => {
    if (typeof window !== "undefined" && axios.isAxiosError(error)) {
        if (error.response?.status === 401) window.dispatchEvent(new Event("ciliar:unauthorized"))
        // Termos ou onboarding obrigatório pendentes: a sessão é relida e o bloqueio aparece.
        if (error.response?.data?.code === "TERMS_ACCEPTANCE_REQUIRED" || error.response?.data?.code === "ONBOARDING_REQUIRED") window.dispatchEvent(new Event("ciliar:terms-required"))
    }
    return Promise.reject(error)
})

export default api
export { api }

/** Extrai a mensagem pt-BR de erro de uma resposta `ApiResponse`. */
export function apiErrorMessage(error: unknown, fallback = "Não foi possível concluir a ação."): string {
    if (axios.isAxiosError(error)) {
        const data = error.response?.data as { error?: string } | undefined
        if (data?.error) return data.error
    }
    return fallback
}

/** Código de erro (`code`) de uma resposta `ApiResponse`, quando houver. */
export function apiErrorCode(error: unknown): string | null {
    if (!axios.isAxiosError(error)) return null
    const data = error.response?.data as { code?: string } | undefined
    return data?.code ?? null
}

/** Dados de uma resposta `ApiResponse` bem-sucedida; lança com a mensagem pt-BR caso contrário. */
export function unwrapApi<T>(response: ApiResponse<T>): T {
    if (!response.success || response.data === undefined) throw new Error(response.error ?? "Resposta inválida")
    return response.data
}
