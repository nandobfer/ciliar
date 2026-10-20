"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { SUMMARY_FEATURE } from "../constants"
import type { SummaryFeatureSettings } from "../schemas"
import type { SummaryFeatureDto } from "../types"
import { AI_QUERY_KEY } from "./useAi"

/** Mesma chave das features de IA: o `useAiFeatureRealtime` da página recarrega ao mudar. */
const KEY = [AI_QUERY_KEY, "feature", SUMMARY_FEATURE] as const
const PATH = `/ai/features/${SUMMARY_FEATURE}`

export const useSummarySettings = () => useQuery({ queryKey: KEY, queryFn: async () => unwrapApi((await api.get<ApiResponse<SummaryFeatureDto>>(PATH)).data) })

export function useSaveSummarySettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: SummaryFeatureSettings) => unwrapApi((await api.put<ApiResponse<SummaryFeatureDto>>(PATH, input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(KEY, saved)
            toast.success('Configuração do "Resumo" salva')
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}
