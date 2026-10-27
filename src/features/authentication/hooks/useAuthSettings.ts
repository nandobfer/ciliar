"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage } from "@/lib/api"
import type { AuthSettingsUpdate } from "../schemas"
import type { AuthSettingsDto } from "../types"

export const AUTH_SETTINGS_KEY = ["authentication", "settings"] as const

export function useAuthSettings() {
    return useQuery({
        queryKey: AUTH_SETTINGS_KEY,
        queryFn: async ({ signal }) => (await api.get<{ data: AuthSettingsDto }>("/authentication/settings", { signal })).data.data,
    })
}

export function useSaveAuthSettings() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (input: AuthSettingsUpdate) => (await api.put<{ data: AuthSettingsDto }>("/authentication/settings", input)).data.data,
        onSuccess: (data) => {
            client.setQueryData(AUTH_SETTINGS_KEY, data)
            toast.success("Configuração de autenticação salva")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}
