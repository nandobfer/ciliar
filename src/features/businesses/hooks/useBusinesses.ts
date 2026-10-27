"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { BUSINESSES_UPDATED_EVENT, businessesChannel } from "@/lib/pusher/channel-names"
import type { BusinessDetailDto, BusinessListDto, InterviewProgressDto, InterviewStatusDto } from "../types"

/** Consultas e mutações dos Negócios e da entrevista (axios central, `baseURL: /api`). */

export const BUSINESSES_KEY = "businesses"
/** Mesmo prefixo das chaves do chat (`OpexScopeOverride`): o fim de cada turno invalida o progresso. */
export const INTERVIEW_QUERY_PREFIX = "business-interview"
export const interviewProgressKey = (id: string) => [INTERVIEW_QUERY_PREFIX, "session", id, "progress"] as const
export const INTERVIEW_STATE_KEY = [INTERVIEW_QUERY_PREFIX, "state"] as const

const get = async <T,>(path: string) => unwrapApi((await api.get<ApiResponse<T>>(path)).data)

/** Relê a sessão (`/api/me`, no cache externo do `AccessProvider`): o onboarding obrigatório pode ter acabado. */
export function refreshSession(): void {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("ciliar:terms-required"))
}

export const useBusinesses = (enabled = true) =>
    useQuery({ queryKey: [BUSINESSES_KEY, "list"], queryFn: () => get<BusinessListDto>("/businesses?status=all"), enabled, staleTime: 15_000 })

export const useBusiness = (id: string | null) =>
    useQuery({ queryKey: [BUSINESSES_KEY, "detail", id ?? ""], queryFn: () => get<BusinessDetailDto>(`/businesses/${id}`), enabled: Boolean(id) })

/**
 * Registra o acesso ao espaço do negócio aberto (uma vez por negócio na tela) e relê a lista: o
 * seletor do cabeçalho ordena pelo último acesso. Falha silenciosa (é só a ordem do seletor).
 */
export function useRecordBusinessAccess(id: string | null, enabled: boolean): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!id || !enabled) return
        api.post(`/businesses/${id}/access`, {})
            .then(() => queryClient.invalidateQueries({ queryKey: [BUSINESSES_KEY, "list"] }))
            .catch(() => undefined)
    }, [id, enabled, queryClient])
}

function useBusinessAction(action: "archive" | "restore" | "delete", success: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (id: string) =>
            action === "delete" ? unwrapApi((await api.delete<ApiResponse<{ id: string }>>(`/businesses/${id}`)).data) : unwrapApi((await api.post<ApiResponse<BusinessDetailDto>>(`/businesses/${id}/${action}`, {})).data),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: [BUSINESSES_KEY] })
            refreshSession()
            toast.success(success)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível concluir a ação")),
    })
}

export const useArchiveBusiness = () => useBusinessAction("archive", "Negócio arquivado")
export const useRestoreBusiness = () => useBusinessAction("restore", "Negócio restaurado")
export const useDeleteBusiness = () => useBusinessAction("delete", "Negócio excluído definitivamente")

/** Lista/seletor ao vivo: só invalidação no canal do próprio usuário real. */
export function useBusinessesRealtime(userId: string | null, enabled: boolean): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!enabled || !userId || !isPusherClientAvailable()) return
        const name = businessesChannel(userId)
        const channel = acquireChannel(name)
        const onUpdated = () => {
            void queryClient.invalidateQueries({ queryKey: [BUSINESSES_KEY] })
            void queryClient.invalidateQueries({ queryKey: [INTERVIEW_QUERY_PREFIX] })
        }
        channel.bind(BUSINESSES_UPDATED_EVENT, onUpdated)
        return () => {
            channel.unbind(BUSINESSES_UPDATED_EVENT, onUpdated)
            releaseChannel(name)
        }
    }, [enabled, userId, queryClient])
}

// ── Entrevista ─────────────────────────────────────────────────────────────

export const useInterviewState = () =>
    useQuery({ queryKey: INTERVIEW_STATE_KEY, queryFn: () => get<{ status: InterviewStatusDto; current: InterviewProgressDto | null }>("/interview"), staleTime: 0, refetchInterval: (query) => (query.state.data?.status.available === false ? 30_000 : false) })

export function useStartInterview() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<InterviewProgressDto>>("/interview/sessions", {})).data),
        onSuccess: (progress) => {
            queryClient.setQueryData(interviewProgressKey(progress.id), progress)
            void queryClient.invalidateQueries({ queryKey: INTERVIEW_STATE_KEY })
        },
    })
}

export const useInterviewProgress = (id: string | null) =>
    useQuery({ queryKey: interviewProgressKey(id ?? ""), queryFn: () => get<InterviewProgressDto>(`/interview/sessions/${id}/progress`), enabled: Boolean(id) })

export function useDiscardInterview() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.delete<ApiResponse<{ id: string }>>(`/interview/sessions/${id}`)).data),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: [INTERVIEW_QUERY_PREFIX] })
            toast.success("Entrevista descartada")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível descartar a entrevista")),
    })
}

export function useRetryOpening(id: string) {
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<{ id: string }>>(`/interview/sessions/${id}/opening`, {})).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível iniciar a conversa")),
    })
}
