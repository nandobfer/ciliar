"use client"

import { useCallback, useEffect, useState } from "react"
import axios from "axios"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { BUSINESS_SPACE_UPDATED_EVENT, businessesChannel } from "@/lib/pusher/channel-names"
import { BUSINESS_ITEM_PATHS, type BusinessFilePurpose, type BusinessItemKind } from "../constants"
import type { PortfolioItemDto } from "@/features/portfolio/types"
import { BUSINESS_DASHBOARD_PERIOD_STORAGE_KEY, businessDashboardPeriodSchema, DEFAULT_BUSINESS_DASHBOARD_PERIOD, type BusinessDashboardPeriod } from "../dashboard-period"
import { usePersistentState } from "@/hooks/usePersistentState"
import type { ActivityDetailDto, ActivityDto, BusinessDashboardDto, BusinessDetailDto, BusinessFileDto, BusinessFileReservationDto, DocumentDto, GoalArchiveResultDto, GoalItemDto, GoalsOverviewDto, ItemListDto, SuccessDto } from "../types"
import { BUSINESSES_KEY } from "./useBusinesses"

/** Consultas e mutações do espaço do negócio (M2), pelo Axios central (`baseURL: /api`). */

export const SPACE_KEY = "business-space"
export const spaceKey = (businessId: string, kind: BusinessItemKind | "dashboard" | "categories" | "portfolio", ...rest: string[]) => [SPACE_KEY, businessId, kind, ...rest] as const

const get = async <T,>(path: string) => unwrapApi((await api.get<ApiResponse<T>>(path)).data)
const base = (businessId: string) => `/businesses/${businessId}`

export interface ItemTypes {
    activities: ActivityDto
    goals: GoalItemDto
    documents: DocumentDto
    successes: SuccessDto
    portfolioItems: PortfolioItemDto
}

export const useItemList = <K extends BusinessItemKind>(businessId: string, kind: K) =>
    useQuery({ queryKey: spaceKey(businessId, kind, "list"), queryFn: () => get<ItemListDto<ItemTypes[K]>>(`${base(businessId)}/${BUSINESS_ITEM_PATHS[kind]}?status=all`), staleTime: 10_000 })

/** Metas: a atual e a linha do tempo. */
export const useGoals = (businessId: string) => useQuery({ queryKey: spaceKey(businessId, "goals", "overview"), queryFn: () => get<GoalsOverviewDto>(`${base(businessId)}/goals`), staleTime: 10_000 })

export const useActivityDetail = (businessId: string, activityId: string | null) =>
    useQuery({ queryKey: spaceKey(businessId, "activities", "detail", activityId ?? ""), queryFn: () => get<ActivityDetailDto>(`${base(businessId)}/activities/${activityId}`), enabled: Boolean(activityId) })

export const useBusinessDashboard = (businessId: string, period: BusinessDashboardPeriod, enabled = true) =>
    useQuery({ queryKey: spaceKey(businessId, "dashboard", period), queryFn: () => get<BusinessDashboardDto>(`${base(businessId)}/dashboard?period=${period}`), enabled, staleTime: 10_000, placeholderData: (previous) => previous })

/** Período do dashboard (no navegador, igual para todos os negócios; padrão: mês atual). */
export function useBusinessDashboardPeriod() {
    const { value: period, setValue, ready } = usePersistentState<BusinessDashboardPeriod>(BUSINESS_DASHBOARD_PERIOD_STORAGE_KEY, businessDashboardPeriodSchema, DEFAULT_BUSINESS_DASHBOARD_PERIOD)
    return { period, setPeriod: setValue, ready }
}

export const useCategories = (businessId: string, kind: "activities" | "documents", enabled = true) =>
    useQuery({ queryKey: spaceKey(businessId, "categories", kind), queryFn: () => get<string[]>(`${base(businessId)}/categories?kind=${kind}`), enabled, staleTime: 30_000 })

function useInvalidateSpace(businessId: string) {
    const queryClient = useQueryClient()
    return useCallback(
        async (kind?: BusinessItemKind) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: kind ? [SPACE_KEY, businessId, kind] : [SPACE_KEY, businessId] }),
                queryClient.invalidateQueries({ queryKey: [SPACE_KEY, businessId, "dashboard"] }),
                queryClient.invalidateQueries({ queryKey: [SPACE_KEY, businessId, "categories"] }),
                // O portfólio (M5) mostra sucessos, documentos, atividades e itens avulsos.
                queryClient.invalidateQueries({ queryKey: [SPACE_KEY, businessId, "portfolio"] }),
                queryClient.invalidateQueries({ queryKey: [BUSINESSES_KEY, "detail", businessId] }),
            ])
        },
        [queryClient, businessId],
    )
}

/** Criar/editar um item (POST/PATCH); conserva o rascunho em caso de erro. */
export function useSaveItem<K extends BusinessItemKind>(businessId: string, kind: K) {
    const invalidate = useInvalidateSpace(businessId)
    return useMutation({
        mutationFn: async ({ id, data }: { id?: string; data: Record<string, unknown> }) =>
            unwrapApi((id ? await api.patch<ApiResponse<ItemTypes[K]>>(`${base(businessId)}/${BUSINESS_ITEM_PATHS[kind]}/${id}`, data) : await api.post<ApiResponse<ItemTypes[K]>>(`${base(businessId)}/${BUSINESS_ITEM_PATHS[kind]}`, data)).data),
        onSuccess: async () => invalidate(kind),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar")),
    })
}

const ACTION_MESSAGES = { archive: "arquivado(a)", restore: "restaurado(a)", delete: "excluído(a) definitivamente" } as const

/** Arquivar, restaurar ou excluir definitivamente um item. */
export function useItemAction(businessId: string, kind: BusinessItemKind, label: string) {
    const invalidate = useInvalidateSpace(businessId)
    return useMutation({
        mutationFn: async ({ id, action }: { id: string; action: "archive" | "restore" | "delete" }) =>
            action === "delete" ? unwrapApi((await api.delete<ApiResponse<{ id: string }>>(`${base(businessId)}/${BUSINESS_ITEM_PATHS[kind]}/${id}`)).data) : unwrapApi((await api.post<ApiResponse<unknown>>(`${base(businessId)}/${BUSINESS_ITEM_PATHS[kind]}/${id}/${action}`, {})).data),
        onSuccess: async (_data, { action }) => {
            await invalidate(kind)
            toast.success(`${label} ${ACTION_MESSAGES[action]}`)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível concluir a ação")),
    })
}

/**
 * Arquivar a meta atual (a anterior volta a valer), restaurar uma arquivada como a atual ou excluir
 * definitivamente uma arquivada — com o aviso do que mudou.
 */
export function useGoalAction(businessId: string) {
    const invalidate = useInvalidateSpace(businessId)
    return useMutation({
        mutationFn: async ({ id, action }: { id: string; action: "archive" | "restore" | "delete" }) => {
            if (action === "delete") return { action, data: unwrapApi((await api.delete<ApiResponse<{ id: string }>>(`${base(businessId)}/goals/${id}`)).data) }
            if (action === "archive") return { action, data: unwrapApi((await api.post<ApiResponse<GoalArchiveResultDto>>(`${base(businessId)}/goals/${id}/archive`, {})).data) }
            return { action, data: unwrapApi((await api.post<ApiResponse<GoalItemDto>>(`${base(businessId)}/goals/${id}/restore`, {})).data) }
        },
        onSuccess: async (result) => {
            await invalidate("goals")
            if (result.action === "delete") toast.success("Meta excluída definitivamente")
            else if (result.action === "restore") toast.success("Meta restaurada como a atual")
            else toast.success((result.data as GoalArchiveResultDto).current ? "Meta arquivada: a anterior voltou a valer" : "Meta arquivada: o negócio está sem meta")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível concluir a ação")),
    })
}

/** Ficha do negócio (PATCH com `version`). */
export function useUpdateBusiness(businessId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => unwrapApi((await api.patch<ApiResponse<BusinessDetailDto>>(base(businessId), data)).data),
        onSuccess: async (detail) => {
            queryClient.setQueryData([BUSINESSES_KEY, "detail", businessId], detail)
            await queryClient.invalidateQueries({ queryKey: [BUSINESSES_KEY, "list"] })
            toast.success("Ficha salva")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a ficha")),
    })
}

export function useBusinessLogo(businessId: string) {
    const queryClient = useQueryClient()
    const done = async (detail: BusinessDetailDto) => {
        queryClient.setQueryData([BUSINESSES_KEY, "detail", businessId], detail)
        await queryClient.invalidateQueries({ queryKey: [BUSINESSES_KEY, "list"] })
    }
    const set = useMutation({
        mutationFn: async (fileId: string) => unwrapApi((await api.put<ApiResponse<BusinessDetailDto>>(`${base(businessId)}/logo`, { fileId })).data),
        onSuccess: async (detail) => {
            await done(detail)
            toast.success("Logo atualizada")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível trocar a logo")),
    })
    const remove = useMutation({
        mutationFn: async () => unwrapApi((await api.delete<ApiResponse<BusinessDetailDto>>(`${base(businessId)}/logo`)).data),
        onSuccess: async (detail) => {
            await done(detail)
            toast.success("Logo removida")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível remover a logo")),
    })
    return { set, remove }
}

export interface UploadState {
    localId: string
    name: string
    size: number
    progress: number
    status: "uploading" | "done" | "error"
    error: string | null
    file: BusinessFileDto | null
}

/**
 * Envio de arquivos do espaço: reserva (limites da Plataforma no servidor), PUT assinado direto no
 * storage com progresso e confirmação. Os enviados ficam pendentes até o item ser salvo.
 */
export function useBusinessUploads(businessId: string, purpose: BusinessFilePurpose) {
    const [items, setItems] = useState<UploadState[]>([])
    const patch = useCallback((localId: string, next: Partial<UploadState>) => setItems((current) => current.map((item) => (item.localId === localId ? { ...item, ...next } : item))), [])

    const upload = useCallback(
        async (file: File): Promise<{ file: BusinessFileDto | null; error: string | null }> => {
            const localId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
            setItems((current) => [...current, { localId, name: file.name, size: file.size, progress: 0, status: "uploading", error: null, file: null }])
            try {
                const reservation = unwrapApi((await api.post<ApiResponse<BusinessFileReservationDto>>(`${base(businessId)}/files`, { purpose, name: file.name, size: file.size, mediaType: file.type })).data)
                try {
                    await axios.put(reservation.url, file, {
                        headers: reservation.headers,
                        onUploadProgress: (event) => {
                            const total = event.total ?? file.size
                            patch(localId, { progress: total > 0 ? Math.min(99, Math.round(((event.loaded ?? 0) / total) * 100)) : 0 })
                        },
                    })
                } catch (error) {
                    void api.delete(`${base(businessId)}/files/${reservation.id}`).catch(() => undefined)
                    throw error
                }
                const uploaded = unwrapApi((await api.post<ApiResponse<BusinessFileDto>>(`${base(businessId)}/files/${reservation.id}/complete`, {})).data)
                patch(localId, { status: "done", progress: 100, file: uploaded })
                return { file: uploaded, error: null }
            } catch (error) {
                const message = apiErrorMessage(error, "Não foi possível enviar o arquivo")
                patch(localId, { status: "error", error: message })
                return { file: null, error: message }
            }
        },
        [businessId, purpose, patch],
    )

    const remove = useCallback((localId: string) => {
        setItems((current) => {
            const item = current.find((entry) => entry.localId === localId)
            if (item?.file) void api.delete(`${base(businessId)}/files/${item.file.id}`).catch(() => undefined)
            return current.filter((entry) => entry.localId !== localId)
        })
    }, [businessId])

    /** Depois de salvar: os enviados já pertencem ao item. */
    const reset = useCallback(() => setItems([]), [])
    /** Fechou sem salvar: apaga os envios pendentes (a rotina também os remove em 24 h). */
    const discard = useCallback(() => {
        setItems((current) => {
            for (const item of current) if (item.file) void api.delete(`${base(businessId)}/files/${item.file.id}`).catch(() => undefined)
            return []
        })
    }, [businessId])
    return { items, upload, remove, reset, discard, busy: items.some((item) => item.status === "uploading") }
}

/** Invalidação ao vivo dos itens do espaço (só o próprio usuário real, sem simulação). */
export function useBusinessSpaceRealtime(userId: string | null, enabled: boolean): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!enabled || !userId || !isPusherClientAvailable()) return
        const name = businessesChannel(userId)
        const channel = acquireChannel(name)
        const onUpdated = (payload: { businessId?: string; kind?: string }) => {
            if (!payload?.businessId) return
            void queryClient.invalidateQueries({ queryKey: [SPACE_KEY, payload.businessId] })
        }
        channel.bind(BUSINESS_SPACE_UPDATED_EVENT, onUpdated)
        return () => {
            channel.unbind(BUSINESS_SPACE_UPDATED_EVENT, onUpdated)
            releaseChannel(name)
        }
    }, [enabled, userId, queryClient])
}
