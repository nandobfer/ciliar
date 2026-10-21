"use client"

import { useEffect, useMemo } from "react"
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { BUSINESS_SPACE_UPDATED_EVENT, businessesChannel } from "@/lib/pusher/channel-names"
import { SPACE_KEY } from "@/features/businesses/hooks/useBusinessSpace"
import { ORDERS_KEY } from "@/features/orders/hooks/useOrders"
import { buildBoardColumns, type WorkBoardDto } from "../board"
import type { WorkColumnCreateInput, WorkColumnInput } from "../schemas"
import type { TimeEntryDto, WorkDetailDto, WorkListDto, WorkSummaryDto } from "../types"

/** Consultas e mutações dos Trabalhos (M4), pelo Axios central (`baseURL: /api`). */

export const WORKS_KEY = "works"

const get = async <T,>(path: string) => unwrapApi((await api.get<ApiResponse<T>>(path)).data)
const base = (businessId: string) => `/businesses/${businessId}`
const workPath = (businessId: string, workId: string) => `${base(businessId)}/works/${workId}`

/** Trabalhos de um negócio (`businessId`) ou a visão geral (todos os negócios do usuário). */
export const useWorks = (scope: { businessId?: string | null; showArchived?: boolean } = {}, enabled = true) =>
    useQuery({
        queryKey: [WORKS_KEY, "list", scope.businessId ?? "all", scope.showArchived ? "all" : "active"],
        queryFn: () => get<WorkListDto>(`${scope.businessId ? `${base(scope.businessId)}/works` : "/works"}?status=${scope.showArchived ? "all" : "active"}`),
        enabled,
        staleTime: 10_000,
    })

export const boardKey = (businessId: string) => [WORKS_KEY, "board", businessId] as const

export function useWorkBoard(businessId: string | null) {
    const query = useQuery({ queryKey: boardKey(businessId ?? ""), queryFn: () => get<WorkBoardDto>(`${base(businessId!)}/work-columns`), enabled: Boolean(businessId), staleTime: 30_000 })
    const columns = useMemo(() => buildBoardColumns(query.data), [query.data])
    return { ...query, columns }
}

export const useWork = (businessId: string, workId: string) => useQuery({ queryKey: [WORKS_KEY, "detail", businessId, workId], queryFn: () => get<WorkDetailDto>(workPath(businessId, workId)) })

export const usePaymentMethods = (enabled = true) => useQuery({ queryKey: [WORKS_KEY, "payment-methods"], queryFn: () => get<string[]>("/works/payment-methods"), enabled, staleTime: 60_000 })

/** Depois de uma alteração: listas, quadro, detalhe, pedidos (W1/W5), dashboard e metas (faturamento). */
async function invalidateWorks(queryClient: QueryClient, businessId: string, detail?: WorkDetailDto) {
    if (detail) queryClient.setQueryData([WORKS_KEY, "detail", businessId, detail.id], detail)
    await Promise.all([
        queryClient.invalidateQueries({ queryKey: [WORKS_KEY, "list"] }),
        queryClient.invalidateQueries({ queryKey: boardKey(businessId) }),
        queryClient.invalidateQueries({ queryKey: [WORKS_KEY, "payment-methods"] }),
        queryClient.invalidateQueries({ queryKey: [ORDERS_KEY] }),
        queryClient.invalidateQueries({ queryKey: [SPACE_KEY, businessId, "dashboard"] }),
        queryClient.invalidateQueries({ queryKey: [SPACE_KEY, businessId, "goals"] }),
        queryClient.invalidateQueries({ queryKey: [SPACE_KEY, businessId, "successes"] }),
        ...(detail ? [] : [queryClient.invalidateQueries({ queryKey: [WORKS_KEY, "detail", businessId] })]),
    ])
}

function useInvalidate(businessId: string) {
    const queryClient = useQueryClient()
    return (detail?: WorkDetailDto) => invalidateWorks(queryClient, businessId, detail)
}

/** Aplica a mudança otimista em todas as listas em cache (o card já fica no lugar ao soltar). */
function patchLists(queryClient: QueryClient, workId: string, patch: Partial<WorkSummaryDto>) {
    const snapshots = queryClient.getQueriesData<WorkListDto>({ queryKey: [WORKS_KEY, "list"] })
    for (const [key, data] of snapshots) {
        if (!data) continue
        queryClient.setQueryData<WorkListDto>(key, { ...data, items: data.items.map((item) => (item.id === workId ? { ...item, ...patch } : item)) })
    }
    return snapshots
}

export type WorkMoveRequest =
    | { kind: "move"; work: WorkSummaryDto; column: string; columnName: string; position?: number }
    | { kind: "pay"; work: WorkSummaryDto; paidOn: string; receivedCents: number; method: string | null; position?: number }
    | { kind: "unpay"; work: WorkSummaryDto; column: string; columnName: string; position?: number }

const MOVE_PATH: Record<WorkMoveRequest["kind"], string> = { move: "move", pay: "payment", unpay: "unpay" }

/** Mover, registrar/corrigir o pagamento e sair de Pago — otimista nas listas; volta se o servidor recusar. */
export function useMoveWork() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (request: WorkMoveRequest) => {
            const body =
                request.kind === "move"
                    ? { column: request.column, position: request.position, version: request.work.version }
                    : request.kind === "pay"
                      ? { paidOn: request.paidOn, receivedCents: request.receivedCents, method: request.method, position: request.position, version: request.work.version }
                      : { column: request.column, position: request.position, confirm: true, version: request.work.version }
            return unwrapApi((await api.post<ApiResponse<WorkDetailDto>>(`${workPath(request.work.businessId, request.work.id)}/${MOVE_PATH[request.kind]}`, body)).data)
        },
        onMutate: async (request) => {
            await queryClient.cancelQueries({ queryKey: [WORKS_KEY, "list"] })
            const position = request.position ?? request.work.position
            const patch: Partial<WorkSummaryDto> =
                request.kind === "pay"
                    ? { column: "paid", columnName: "Pago", position, payment: { paidOn: request.paidOn, receivedCents: request.receivedCents, method: request.method, at: new Date().toISOString() } }
                    : { column: request.column, columnName: request.columnName, position, ...(request.kind === "unpay" ? { payment: null } : {}) }
            return patchLists(queryClient, request.work.id, patch)
        },
        onError: (error, _request, snapshots) => {
            for (const [key, data] of snapshots ?? []) queryClient.setQueryData(key, data)
            toast.error(apiErrorMessage(error, "Não foi possível mover o trabalho"))
        },
        onSuccess: (detail, request) => {
            if (request.kind === "pay") toast.success(request.work.column === "paid" ? `${detail.code}: pagamento corrigido` : `${detail.code} em Pago: entrou no faturamento`)
            else if (request.kind === "unpay") toast.success(`${detail.code} saiu de Pago e do faturamento`)
            else if (request.work.column !== request.column) toast.success(`${detail.code} em ${request.columnName}`)
        },
        onSettled: (detail, _error, request) => invalidateWorks(queryClient, request.work.businessId, detail),
    })
}

export function useUpdateWork(businessId: string, workId: string) {
    const invalidate = useInvalidate(businessId)
    return useMutation({
        mutationFn: async (data: Record<string, unknown>) => unwrapApi((await api.patch<ApiResponse<WorkDetailDto>>(workPath(businessId, workId), data)).data),
        onSuccess: async (detail) => {
            await invalidate(detail)
            toast.success("Trabalho salvo: a alteração ficou no histórico do pedido")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar o trabalho")),
    })
}

const ACTION_MESSAGES = { archive: "Trabalho arquivado", restore: "Trabalho restaurado", delete: "Trabalho excluído definitivamente" } as const

export function useWorkAction(businessId: string) {
    const invalidate = useInvalidate(businessId)
    return useMutation({
        mutationFn: async ({ id, action }: { id: string; action: "archive" | "restore" | "delete" }) =>
            action === "delete" ? (unwrapApi((await api.delete<ApiResponse<{ id: string }>>(workPath(businessId, id))).data), null) : unwrapApi((await api.post<ApiResponse<WorkDetailDto>>(`${workPath(businessId, id)}/${action}`, {})).data),
        onSuccess: async (detail, { action }) => {
            await invalidate(detail ?? undefined)
            toast.success(ACTION_MESSAGES[action])
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível concluir a ação")),
    })
}

// ── Colunas ────────────────────────────────────────────────────────────────

export function useWorkColumnMutations(businessId: string) {
    const queryClient = useQueryClient()
    const key = boardKey(businessId)
    const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: key }), queryClient.invalidateQueries({ queryKey: [WORKS_KEY, "list"] })])
    const done = (board: WorkBoardDto) => queryClient.setQueryData(key, board)

    const create = useMutation({
        mutationFn: async (input: WorkColumnCreateInput) => unwrapApi((await api.post<ApiResponse<WorkBoardDto>>(`${base(businessId)}/work-columns`, input)).data),
        onSuccess: (board, input) => {
            done(board)
            toast.success(`Coluna "${input.name}" criada`)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível criar a coluna")),
        onSettled: refresh,
    })

    const update = useMutation({
        mutationFn: async ({ key: columnKey, input }: { key: string; input: WorkColumnInput }) => unwrapApi((await api.patch<ApiResponse<WorkBoardDto>>(`${base(businessId)}/work-columns/${columnKey}`, input)).data),
        onMutate: async ({ key: columnKey, input }) => {
            await queryClient.cancelQueries({ queryKey: key })
            const previous = queryClient.getQueryData<WorkBoardDto>(key)
            queryClient.setQueryData<WorkBoardDto>(key, (data) => (data ? { ...data, columns: data.columns.map((column) => (column.key === columnKey ? { ...column, ...input, description: input.description.trim() || null } : column)) } : data))
            return previous
        },
        onError: (error, _variables, previous) => {
            if (previous) queryClient.setQueryData(key, previous)
            toast.error(apiErrorMessage(error, "Não foi possível salvar a coluna"))
        },
        onSuccess: (board, { input }) => {
            done(board)
            toast.success(`Coluna "${input.name}" salva`)
        },
        onSettled: refresh,
    })

    const remove = useMutation({
        mutationFn: async (columnKey: string) => unwrapApi((await api.delete<ApiResponse<WorkBoardDto>>(`${base(businessId)}/work-columns/${columnKey}`)).data),
        onMutate: async (columnKey) => {
            await queryClient.cancelQueries({ queryKey: key })
            const previous = queryClient.getQueryData<WorkBoardDto>(key)
            queryClient.setQueryData<WorkBoardDto>(key, (data) => (data ? { ...data, columns: data.columns.filter((item) => item.key !== columnKey), layout: data.layout.filter((item) => item !== columnKey) } : data))
            return previous
        },
        onError: (error, _key, previous) => {
            if (previous) queryClient.setQueryData(key, previous)
            toast.error(apiErrorMessage(error, "Não foi possível excluir a coluna"))
        },
        onSuccess: (board) => {
            done(board)
            toast.success("Coluna excluída")
        },
        onSettled: refresh,
    })

    /** Nova ordem (otimista: as colunas já ficam no lugar; volta se o servidor recusar). */
    const reorder = useMutation({
        mutationFn: async (order: string[]) => unwrapApi((await api.put<ApiResponse<WorkBoardDto>>(`${base(businessId)}/work-columns/order`, { order })).data),
        onMutate: async (order) => {
            await queryClient.cancelQueries({ queryKey: key })
            const previous = queryClient.getQueryData<WorkBoardDto>(key)
            queryClient.setQueryData<WorkBoardDto>(key, (data) => (data ? { ...data, layout: order } : data))
            return previous
        },
        onError: (error, _order, previous) => {
            if (previous) queryClient.setQueryData(key, previous)
            toast.error(apiErrorMessage(error, "Não foi possível reorganizar as colunas"))
        },
        onSettled: refresh,
    })

    return { create, update, remove, reorder }
}

// ── Horas, notas e anexos ──────────────────────────────────────────────────

export function useSaveTimeEntry(businessId: string, workId: string) {
    const invalidate = useInvalidate(businessId)
    return useMutation({
        mutationFn: async ({ id, data }: { id?: string; data: Record<string, unknown> }) =>
            unwrapApi((id ? await api.patch<ApiResponse<TimeEntryDto>>(`${workPath(businessId, workId)}/time-entries/${id}`, data) : await api.post<ApiResponse<TimeEntryDto>>(`${workPath(businessId, workId)}/time-entries`, data)).data),
        onSuccess: async (_entry, { id }) => {
            await invalidate()
            toast.success(id ? "Lançamento salvo" : "Horas lançadas")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar as horas")),
    })
}

export function useDeleteTimeEntry(businessId: string, workId: string) {
    const invalidate = useInvalidate(businessId)
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.delete<ApiResponse<{ id: string }>>(`${workPath(businessId, workId)}/time-entries/${id}`)).data),
        onSuccess: async () => {
            await invalidate()
            toast.success("Lançamento excluído")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível excluir o lançamento")),
    })
}

export function useWorkNote(businessId: string, workId: string) {
    const invalidate = useInvalidate(businessId)
    return useMutation({
        mutationFn: async ({ id, content, remove }: { id?: string; content?: string; remove?: boolean }) => {
            const path = `${workPath(businessId, workId)}/notes`
            if (remove && id) return unwrapApi((await api.delete<ApiResponse<WorkDetailDto>>(`${path}/${id}`)).data)
            if (id) return unwrapApi((await api.patch<ApiResponse<WorkDetailDto>>(`${path}/${id}`, { content })).data)
            return unwrapApi((await api.post<ApiResponse<WorkDetailDto>>(path, { content })).data)
        },
        onSuccess: async (detail, { id, remove }) => {
            await invalidate(detail)
            toast.success(remove ? "Nota excluída" : id ? "Nota salva" : "Nota adicionada")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a nota")),
    })
}

export function useWorkAttachments(businessId: string, workId: string) {
    const invalidate = useInvalidate(businessId)
    const add = useMutation({
        mutationFn: async (fileIds: string[]) => unwrapApi((await api.post<ApiResponse<WorkDetailDto>>(`${workPath(businessId, workId)}/attachments`, { fileIds })).data),
        onSuccess: async (detail) => {
            await invalidate(detail)
            toast.success("Anexos adicionados")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível anexar os arquivos")),
    })
    const remove = useMutation({
        mutationFn: async (fileId: string) => unwrapApi((await api.delete<ApiResponse<WorkDetailDto>>(`${workPath(businessId, workId)}/attachments/${fileId}`)).data),
        onSuccess: async (detail) => {
            await invalidate(detail)
            toast.success("Anexo removido")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível remover o anexo")),
    })
    return { add, remove }
}

/** Tempo real (só invalidação): trabalhos, quadro e o detalhe relidos pela API (pedido aceito pelo link cria trabalho). */
export function useWorksRealtime(userId: string | null, enabled: boolean): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!enabled || !userId || !isPusherClientAvailable()) return
        const name = businessesChannel(userId)
        const channel = acquireChannel(name)
        const onSpace = (payload: { businessId?: string; kind?: string }) => {
            if (!payload?.kind || !["works", "orders", "successes"].includes(payload.kind)) return
            void queryClient.invalidateQueries({ queryKey: [WORKS_KEY] })
        }
        channel.bind(BUSINESS_SPACE_UPDATED_EVENT, onSpace)
        return () => {
            channel.unbind(BUSINESS_SPACE_UPDATED_EVENT, onSpace)
            releaseChannel(name)
        }
    }, [enabled, userId, queryClient])
}
