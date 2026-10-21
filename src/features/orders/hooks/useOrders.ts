"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { BUSINESS_SPACE_UPDATED_EVENT, businessesChannel } from "@/lib/pusher/channel-names"
import { AI_QUERY_KEY } from "@/features/ai/hooks/useAi"
import { BUSINESSES_KEY } from "@/features/businesses/hooks/useBusinesses"
import { CLIENTS_UPDATED_EVENT, ORDER_DECIDED_EVENT, ORDER_TITLE_FEATURE } from "../constants"
import type { OrderTitleFeatureSettings } from "../schemas"
import type { ClientDetailDto, ClientListDto, OrderDto, OrderLinkUrlDto, OrderListDto, OrderSendResultDto, OrderTitleFeatureDto } from "../types"

/** Consultas e mutações de Clientes e Pedidos (M3), pelo Axios central (`baseURL: /api`). */

export const CLIENTS_KEY = "clients"
export const ORDERS_KEY = "orders"

const get = async <T,>(path: string) => unwrapApi((await api.get<ApiResponse<T>>(path)).data)

// ── Clientes ───────────────────────────────────────────────────────────────

export const useClients = (enabled = true) => useQuery({ queryKey: [CLIENTS_KEY, "list"], queryFn: () => get<ClientListDto>("/clients?status=all"), enabled, staleTime: 10_000 })

export const useClient = (id: string | null) => useQuery({ queryKey: [CLIENTS_KEY, "detail", id], queryFn: () => get<ClientDetailDto>(`/clients/${id}`), enabled: Boolean(id) })

function useInvalidateClients() {
    const queryClient = useQueryClient()
    return () => Promise.all([queryClient.invalidateQueries({ queryKey: [CLIENTS_KEY] }), queryClient.invalidateQueries({ queryKey: [ORDERS_KEY] })])
}

export function useSaveClient() {
    const invalidate = useInvalidateClients()
    return useMutation({
        mutationFn: async ({ id, data }: { id?: string; data: Record<string, unknown> }) =>
            unwrapApi((id ? await api.patch<ApiResponse<ClientDetailDto>>(`/clients/${id}`, data) : await api.post<ApiResponse<ClientDetailDto>>("/clients", data)).data),
        onSuccess: async (_client, { id }) => {
            await invalidate()
            toast.success(id ? "Cliente salvo" : "Cliente criado")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar o cliente")),
    })
}

const CLIENT_MESSAGES = { archive: "Cliente arquivado", restore: "Cliente restaurado", delete: "Cliente excluído definitivamente" } as const

export function useClientAction() {
    const invalidate = useInvalidateClients()
    return useMutation({
        mutationFn: async ({ id, action }: { id: string; action: "archive" | "restore" | "delete" }) =>
            action === "delete" ? unwrapApi((await api.delete<ApiResponse<{ id: string }>>(`/clients/${id}`)).data) : unwrapApi((await api.post<ApiResponse<unknown>>(`/clients/${id}/${action}`, {})).data),
        onSuccess: async (_data, { action }) => {
            await invalidate()
            toast.success(CLIENT_MESSAGES[action])
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível concluir a ação")),
    })
}

// ── Pedidos ────────────────────────────────────────────────────────────────

/** Pedidos de um negócio (`businessId`) ou a visão global (todos os negócios do usuário). */
export const useOrders = (scope: { businessId?: string | null } = {}, enabled = true) =>
    useQuery({
        queryKey: [ORDERS_KEY, "list", scope.businessId ?? "all"],
        queryFn: () => get<OrderListDto>(scope.businessId ? `/businesses/${scope.businessId}/orders` : "/orders"),
        enabled,
        staleTime: 10_000,
    })

export const useOrder = (businessId: string, orderId: string | null) =>
    useQuery({ queryKey: [ORDERS_KEY, "detail", businessId, orderId], queryFn: () => get<OrderDto>(`/businesses/${businessId}/orders/${orderId}`), enabled: Boolean(orderId) })

function useInvalidateOrders(businessId: string) {
    const queryClient = useQueryClient()
    return async (order?: OrderDto) => {
        if (order) queryClient.setQueryData([ORDERS_KEY, "detail", businessId, order.id], order)
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: [ORDERS_KEY, "list"] }),
            queryClient.invalidateQueries({ queryKey: [CLIENTS_KEY] }),
            queryClient.invalidateQueries({ queryKey: [BUSINESSES_KEY, "detail", businessId] }),
        ])
    }
}

export function useSaveOrder(businessId: string) {
    const invalidate = useInvalidateOrders(businessId)
    return useMutation({
        mutationFn: async ({ id, data }: { id?: string; data: Record<string, unknown> }) =>
            unwrapApi((id ? await api.patch<ApiResponse<OrderDto>>(`/businesses/${businessId}/orders/${id}`, data) : await api.post<ApiResponse<OrderDto>>(`/businesses/${businessId}/orders`, data)).data),
        onSuccess: async (order, { id }) => {
            await invalidate(order)
            toast.success(id ? "Pedido salvo" : `Pedido ${order.code} criado`)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar o pedido")),
    })
}

export type OrderStatusAction = "revoke" | "accept" | "reject" | "reopen" | "cancel"
const ORDER_MESSAGES: Record<OrderStatusAction, string> = {
    revoke: "Link revogado: o pedido voltou a Rascunho",
    accept: "Pedido aceito: o trabalho foi criado em Abertura",
    reject: "Recusa registrada",
    reopen: "Pedido reaberto como Rascunho",
    cancel: "Pedido cancelado",
}

export function useOrderAction(businessId: string, orderId: string) {
    const invalidate = useInvalidateOrders(businessId)
    return useMutation({
        mutationFn: async ({ action, data }: { action: OrderStatusAction; data: Record<string, unknown> }) => unwrapApi((await api.post<ApiResponse<OrderDto>>(`/businesses/${businessId}/orders/${orderId}/${action}`, data)).data),
        onSuccess: async (order, { action }) => {
            await invalidate(order)
            toast.success(ORDER_MESSAGES[action])
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível concluir a ação")),
    })
}

const EMAIL_MESSAGES: Record<NonNullable<OrderSendResultDto["email"]>, string | null> = {
    sent: "E-mail enviado ao cliente",
    skipped: null,
    "no-email": "O cliente não tem e-mail: copie o link e envie por outro canal",
    "smtp-unavailable": "SMTP não configurado: o e-mail não foi enviado",
    failed: "Falha ao enviar o e-mail: copie o link e envie por outro canal",
}

export function useSendOrder(businessId: string, orderId: string) {
    const invalidate = useInvalidateOrders(businessId)
    return useMutation({
        mutationFn: async (data: { validUntil?: string; email: boolean; version: number }) => unwrapApi((await api.post<ApiResponse<OrderSendResultDto>>(`/businesses/${businessId}/orders/${orderId}/send`, data)).data),
        onSuccess: async (result) => {
            await invalidate(result.order)
            toast.success("Orçamento enviado: o link está ativo")
            const message = result.email ? EMAIL_MESSAGES[result.email] : null
            if (message) (result.email === "sent" ? toast.success : toast.warning)(message)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível enviar o pedido")),
    })
}

/** "Copiar link": a URL só é lida quando o usuário pede. */
export function useCopyOrderLink(businessId: string, orderId: string) {
    return useMutation({
        mutationFn: async () => unwrapApi((await api.get<ApiResponse<OrderLinkUrlDto>>(`/businesses/${businessId}/orders/${orderId}/link`)).data),
        onSuccess: async ({ url }) => {
            await navigator.clipboard.writeText(url)
            toast.success("Link copiado")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível copiar o link")),
    })
}

export function useRegenerateOrderTitle(businessId: string, orderId: string) {
    const invalidate = useInvalidateOrders(businessId)
    return useMutation({
        mutationFn: async () => unwrapApi((await api.post<ApiResponse<OrderDto>>(`/businesses/${businessId}/orders/${orderId}/regenerate-title`, {})).data),
        onSuccess: (order) => invalidate(order),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível gerar o título")),
    })
}

/**
 * Tempo real (só invalidação): clientes e pedidos do dono relidos pela API; quando o cliente decide
 * pelo link, a tela relê o pedido e mostra o toast. Só o próprio usuário real (sem simulação).
 */
export function useOrdersRealtime(userId: string | null, enabled: boolean): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!enabled || !userId || !isPusherClientAvailable()) return
        const name = businessesChannel(userId)
        const channel = acquireChannel(name)
        const onClients = () => void queryClient.invalidateQueries({ queryKey: [CLIENTS_KEY] })
        const onSpace = (payload: { businessId?: string; kind?: string }) => {
            if (payload?.kind !== "orders") return
            void queryClient.invalidateQueries({ queryKey: [ORDERS_KEY] })
        }
        const onDecided = async (payload: { businessId?: string; orderId?: string }) => {
            if (!payload?.businessId || !payload.orderId) return
            await queryClient.invalidateQueries({ queryKey: [ORDERS_KEY] })
            await queryClient.invalidateQueries({ queryKey: [CLIENTS_KEY] })
            try {
                const order = await queryClient.fetchQuery({ queryKey: [ORDERS_KEY, "detail", payload.businessId, payload.orderId], queryFn: () => get<OrderDto>(`/businesses/${payload.businessId}/orders/${payload.orderId}`) })
                const decision = order.decision
                if (!decision || decision.by !== "client") return
                const text = `${order.code}: o cliente ${decision.kind === "accept" ? "aceitou" : "recusou"} o orçamento${decision.name ? ` (${decision.name})` : ""}`
                if (decision.kind === "accept") toast.success(text)
                else toast.warning(text)
            } catch {
                // Sem acesso ao pedido (ex.: perfil mudou): só a invalidação.
            }
        }
        channel.bind(CLIENTS_UPDATED_EVENT, onClients)
        channel.bind(BUSINESS_SPACE_UPDATED_EVENT, onSpace)
        channel.bind(ORDER_DECIDED_EVENT, onDecided)
        return () => {
            channel.unbind(CLIENTS_UPDATED_EVENT, onClients)
            channel.unbind(BUSINESS_SPACE_UPDATED_EVENT, onSpace)
            channel.unbind(ORDER_DECIDED_EVENT, onDecided)
            releaseChannel(name)
        }
    }, [enabled, userId, queryClient])
}

// ── Configuração do agente de título ───────────────────────────────────────

const FEATURE_KEY = [AI_QUERY_KEY, "feature", ORDER_TITLE_FEATURE] as const
const FEATURE_PATH = `/ai/features/${ORDER_TITLE_FEATURE}`

export const useOrderTitleSettings = () => useQuery({ queryKey: FEATURE_KEY, queryFn: () => get<OrderTitleFeatureDto>(FEATURE_PATH) })

export function useSaveOrderTitleSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: OrderTitleFeatureSettings) => unwrapApi((await api.put<ApiResponse<OrderTitleFeatureDto>>(FEATURE_PATH, input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(FEATURE_KEY, saved)
            toast.success('Configuração do "Título de pedidos" salva')
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}
