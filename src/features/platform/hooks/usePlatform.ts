"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage } from "@/lib/api"
import type { LegalPublishInput, PlatformSettingsUpdate } from "../schemas"
import type { LegalOverviewDto, LegalVersionDto, MyLegalDto, PlatformSettingsDto } from "../types"

export const PLATFORM_SETTINGS_KEY = ["platform", "settings"] as const
export const PLATFORM_LEGAL_KEY = ["platform", "legal"] as const
export const MY_LEGAL_KEY = ["me", "legal"] as const

export function usePlatformSettings() {
    return useQuery({
        queryKey: PLATFORM_SETTINGS_KEY,
        queryFn: async ({ signal }) => (await api.get<{ data: PlatformSettingsDto }>("/platform/settings", { signal })).data.data,
    })
}

export function useSavePlatformSettings() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (input: PlatformSettingsUpdate) => (await api.put<{ data: PlatformSettingsDto }>("/platform/settings", input)).data.data,
        onSuccess: (data) => {
            client.setQueryData(PLATFORM_SETTINGS_KEY, data)
            toast.success("Configuração da plataforma salva")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar a configuração")),
    })
}

export function useLegalOverview() {
    return useQuery({
        queryKey: PLATFORM_LEGAL_KEY,
        queryFn: async ({ signal }) => (await api.get<{ data: LegalOverviewDto }>("/platform/legal", { signal })).data.data,
    })
}

export function useLegalVersion(version: number | null) {
    return useQuery({
        queryKey: [...PLATFORM_LEGAL_KEY, version],
        enabled: version !== null,
        queryFn: async ({ signal }) => (await api.get<{ data: LegalVersionDto }>("/platform/legal", { params: { version }, signal })).data.data,
    })
}

export function usePublishLegal() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (input: LegalPublishInput) => (await api.post<{ data: { version: number } }>("/platform/legal", input)).data.data,
        onSuccess: async ({ version }) => {
            toast.success(`Versão ${version} publicada. Todos os usuários deverão aceitá-la no próximo acesso.`)
            await Promise.all([client.invalidateQueries({ queryKey: ["platform"] }), client.invalidateQueries({ queryKey: ["session"] })])
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível publicar a nova versão")),
    })
}

export function useMyLegal() {
    return useQuery({
        queryKey: MY_LEGAL_KEY,
        staleTime: 0,
        queryFn: async ({ signal }) => (await api.get<{ data: MyLegalDto }>("/me/legal", { signal })).data.data,
    })
}

export function useAcceptLegal() {
    return useMutation({
        mutationFn: async (version: number) => (await api.post<{ data: { version: number; acceptedAt: string } }>("/me/legal/accept", { version })).data.data,
    })
}
