"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { AI_QUERY_KEY } from "@/features/ai/hooks/useAi"
import { INTERVIEWER_FEATURE, type InterviewQuestionDef } from "../constants"
import type { InterviewerSettings } from "../schemas"
import type { InterviewerSettingsDto, InterviewScriptVersionDto } from "../types"

/** Mesma chave das features de IA: o `useAiFeatureRealtime` da página recarrega ao mudar. */
export const INTERVIEWER_SETTINGS_KEY = [AI_QUERY_KEY, "feature", INTERVIEWER_FEATURE] as const
const BASE = `/ai/features/${INTERVIEWER_FEATURE}`

export const useInterviewerSettings = () =>
    useQuery({ queryKey: INTERVIEWER_SETTINGS_KEY, queryFn: async () => unwrapApi((await api.get<ApiResponse<InterviewerSettingsDto>>(BASE)).data) })

export const useInterviewScriptVersion = (version: number | null) =>
    useQuery({
        queryKey: [...INTERVIEWER_SETTINGS_KEY, "version", version ?? -1],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<InterviewScriptVersionDto>>(`${BASE}/script?version=${version}`)).data),
        enabled: version !== null,
    })

export function useSaveInterviewerSettings() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: InterviewerSettings) => unwrapApi((await api.put<ApiResponse<InterviewerSettingsDto>>(BASE, input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(INTERVIEWER_SETTINGS_KEY, saved)
            toast.success('Configuração do "Agente Entrevistador" salva')
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}

export function useSaveInterviewScript() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: { questions: InterviewQuestionDef[]; notes: string; version: number }) => unwrapApi((await api.put<ApiResponse<InterviewerSettingsDto>>(`${BASE}/script`, input)).data),
        onSuccess: (saved) => {
            queryClient.setQueryData(INTERVIEWER_SETTINGS_KEY, saved)
            toast.success(`Roteiro salvo (versão ${saved.script.version})`)
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar o roteiro")),
    })
}
