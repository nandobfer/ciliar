"use client"

import { useEffect, useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { BUSINESS_SPACE_UPDATED_EVENT, businessesChannel } from "@/lib/pusher/channel-names"
import { ORDERS_KEY } from "@/features/orders/hooks/useOrders"
import { WORKS_KEY } from "@/features/works/hooks/useWorks"
import { CALENDAR_UPDATED_EVENT, type CalendarEventKind } from "../constants"
import type { CalendarEventDto, CalendarRangeDto, DeadlineConflictDto, GoogleCalendarItemDto, GoogleConnectionDto, GoogleSyncResultDto } from "../types"

/** Consultas e mutações do Calendário (CIL-4), pelo Axios central (`baseURL: /api`). */

export const CALENDAR_KEY = "calendar"
const GOOGLE_KEY = [CALENDAR_KEY, "google"] as const

const get = async <T,>(path: string) => unwrapApi((await api.get<ApiResponse<T>>(path)).data)

export interface CalendarRangeParams {
    from: string
    to: string
    businessId?: string | null
    types: readonly CalendarEventKind[]
}

const rangePath = (params: CalendarRangeParams) => {
    const search = new URLSearchParams({ from: params.from, to: params.to, types: params.types.join(",") })
    if (params.businessId) search.set("businessId", params.businessId)
    return `/calendar/events?${search}`
}

export const rangeKey = (params: CalendarRangeParams) => [CALENDAR_KEY, "range", params.businessId ?? "all", params.from, params.to, params.types.join(",")] as const

export const useCalendarRange = (params: CalendarRangeParams, enabled = true) =>
    useQuery({ queryKey: rangeKey(params), queryFn: () => get<CalendarRangeDto>(rangePath(params)), enabled, staleTime: 15_000, placeholderData: keepPreviousData })

function useDebounced<T>(value: T, delay: number): T {
    const [current, setCurrent] = useState(value)
    useEffect(() => {
        const timer = setTimeout(() => setCurrent(value), delay)
        return () => clearTimeout(timer)
    }, [value, delay])
    return current
}

export interface ConflictParams {
    businessId?: string | null
    dueDate?: string | null
    estimatedMinutes?: number | null
    orderId?: string | null
    workId?: string | null
}

/** Alerta de conflito (com espera curta enquanto o usuário digita). Nunca bloqueia nada. */
export function useDeadlineConflict(params: ConflictParams, enabled = true) {
    // A espera usa a consulta serializada (estável entre renderizações), nunca o objeto.
    const search = useDebounced(conflictSearch(params), 400)
    const parsed = new URLSearchParams(search)
    const ready = enabled && Boolean(parsed.get("dueDate") || parsed.get("orderId") || parsed.get("workId"))
    return useQuery({ queryKey: [CALENDAR_KEY, "conflict", search], queryFn: () => get<DeadlineConflictDto>(`/calendar/conflict?${search}`), enabled: ready, staleTime: 15_000, retry: false })
}

function conflictSearch(params: ConflictParams): string {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined && value !== "") search.set(key, String(value))
    return search.toString()
}

export const fetchDeadlineConflict = (params: ConflictParams) => get<DeadlineConflictDto>(`/calendar/conflict?${conflictSearch(params)}`)

/** Arrastar o prazo: trabalho pela W1 (PATCH do trabalho) e pedido aberto pelo PATCH do pedido. Otimista. */
export function useMoveDeadline() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ event, dueDate }: { event: CalendarEventDto; dueDate: string }) => {
            if (!event.businessId || event.version === null) throw new Error("Evento sem negócio")
            if (event.kind === "work-deadline" && event.workId) await api.patch(`/businesses/${event.businessId}/works/${event.workId}`, { dueDate, version: event.version })
            else if (event.kind === "order-deadline" && event.orderId) await api.patch(`/businesses/${event.businessId}/orders/${event.orderId}`, { dueDate, version: event.version })
            else throw new Error("Este evento não pode ser movido")
            return fetchDeadlineConflict(event.kind === "work-deadline" ? { businessId: event.businessId, workId: event.workId } : { businessId: event.businessId, orderId: event.orderId }).catch(() => null)
        },
        onMutate: async ({ event, dueDate }) => {
            await queryClient.cancelQueries({ queryKey: [CALENDAR_KEY, "range"] })
            const snapshots = queryClient.getQueriesData<CalendarRangeDto>({ queryKey: [CALENDAR_KEY, "range"] })
            for (const [key, data] of snapshots) {
                if (!data) continue
                queryClient.setQueryData<CalendarRangeDto>(key, {
                    ...data,
                    events: data.events.map((item) => {
                        if (item.id === event.id) return { ...item, start: dueDate, end: dueDate, conflict: null }
                        if (event.workId && item.kind === "work-period" && item.workId === event.workId) return { ...item, end: dueDate, start: item.start > dueDate ? dueDate : item.start }
                        return item
                    }),
                })
            }
            return snapshots
        },
        onError: (error, _input, snapshots) => {
            for (const [key, data] of snapshots ?? []) queryClient.setQueryData(key, data)
            toast.error(apiErrorMessage(error, "Não foi possível mover o prazo"))
        },
        onSettled: () =>
            Promise.all([
                queryClient.invalidateQueries({ queryKey: [CALENDAR_KEY] }),
                queryClient.invalidateQueries({ queryKey: [WORKS_KEY] }),
                queryClient.invalidateQueries({ queryKey: [ORDERS_KEY] }),
            ]),
    })
}

// ── Google ────────────────────────────────────────────────────────────────

export const useGoogleConnection = (enabled = true) => useQuery({ queryKey: GOOGLE_KEY, queryFn: () => get<GoogleConnectionDto>("/calendar/google"), enabled, staleTime: 30_000 })

export const useGoogleCalendars = (enabled: boolean) => useQuery({ queryKey: [...GOOGLE_KEY, "calendars"], queryFn: () => get<GoogleCalendarItemDto[]>("/calendar/google/calendars"), enabled, staleTime: 60_000, retry: false })

function useRefreshCalendar() {
    const queryClient = useQueryClient()
    return () => queryClient.invalidateQueries({ queryKey: [CALENDAR_KEY] })
}

export function useGoogleConnect() {
    return useMutation({
        mutationFn: async (returnTo: string) => unwrapApi((await api.post<ApiResponse<{ url: string }>>("/calendar/google/connect", { returnTo })).data),
        onSuccess: ({ url }) => window.location.assign(url),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível iniciar a conexão com o Google")),
    })
}

export function useGoogleDisconnect() {
    const refresh = useRefreshCalendar()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.delete<ApiResponse<GoogleConnectionDto>>("/calendar/google")).data),
        onSuccess: async () => {
            await refresh()
            toast.success("Google Agenda desconectado: os eventos publicados ficam na agenda")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível desconectar")),
    })
}

export function useGoogleSettings() {
    const refresh = useRefreshCalendar()
    return useMutation({
        mutationFn: async (data: { publishCalendarId?: string | null; readCalendarIds?: string[] }) => unwrapApi((await api.patch<ApiResponse<GoogleConnectionDto>>("/calendar/google/settings", data)).data),
        onSuccess: async () => {
            await refresh()
            toast.success("Agendas do Google salvas")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar as agendas")),
    })
}

export function useGoogleSync() {
    const refresh = useRefreshCalendar()
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<GoogleSyncResultDto>>("/calendar/google/sync", {})).data),
        onSuccess: async (result) => {
            await refresh()
            const parts = [result.published ? `${result.published} publicado(s)` : null, result.applied ? `${result.applied} prazo(s) atualizado(s)` : null, result.unlinked ? `${result.unlinked} desvinculado(s)` : null].filter(Boolean)
            if (result.errors) toast.warning(`Sincronizado com ${result.errors} falha(s)${parts.length ? `: ${parts.join(", ")}` : ""}`)
            else toast.success(parts.length ? `Google Agenda sincronizado: ${parts.join(", ")}` : "Google Agenda sincronizado")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível sincronizar com o Google")),
    })
}

export function useGoogleRepublish() {
    const refresh = useRefreshCalendar()
    return useMutation({
        mutationFn: async (data: { all: true } | { kind: string; id: string }) => unwrapApi((await api.post<ApiResponse<GoogleConnectionDto>>("/calendar/google/republish", data)).data),
        onSuccess: async () => {
            await refresh()
            toast.success("Evento republicado no Google Agenda")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível republicar")),
    })
}

/** Tempo real (só invalidação): trabalhos, pedidos e a conexão Google relidos pela API. */
export function useCalendarRealtime(userId: string | null, enabled: boolean): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!enabled || !userId || !isPusherClientAvailable()) return
        const name = businessesChannel(userId)
        const channel = acquireChannel(name)
        const onSpace = (payload: { kind?: string }) => {
            if (!payload?.kind || !["works", "orders", "calendar"].includes(payload.kind)) return
            void queryClient.invalidateQueries({ queryKey: [CALENDAR_KEY] })
        }
        const onCalendar = () => void queryClient.invalidateQueries({ queryKey: [CALENDAR_KEY] })
        channel.bind(BUSINESS_SPACE_UPDATED_EVENT, onSpace)
        channel.bind(CALENDAR_UPDATED_EVENT, onCalendar)
        return () => {
            channel.unbind(BUSINESS_SPACE_UPDATED_EVENT, onSpace)
            channel.unbind(CALENDAR_UPDATED_EVENT, onCalendar)
            releaseChannel(name)
        }
    }, [enabled, userId, queryClient])
}
