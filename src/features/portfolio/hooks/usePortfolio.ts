"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { spaceKey } from "@/features/businesses/hooks/useBusinessSpace"
import type { PortfolioBlock } from "../blocks"
import type { PortfolioTemplate } from "../templates"
import type { PortfolioDraftSavedDto, PortfolioDto, PortfolioMediaDto, PortfolioPublicationDto, PortfolioSlugCheckDto, PublicPortfolioDto } from "../types"

/** Consultas e mutações do portfólio (M5), pelo Axios central (`baseURL: /api`). */

const base = (businessId: string) => `/businesses/${businessId}/portfolio`
const get = async <T,>(path: string) => unwrapApi((await api.get<ApiResponse<T>>(path)).data)
export const portfolioKey = (businessId: string) => spaceKey(businessId, "portfolio", "config")

export const usePortfolio = (businessId: string) => useQuery({ queryKey: portfolioKey(businessId), queryFn: () => get<PortfolioDto>(base(businessId)), staleTime: 10_000 })

export const usePortfolioTags = (businessId: string, enabled = true) =>
    useQuery({ queryKey: spaceKey(businessId, "portfolioItems", "tags"), queryFn: () => get<string[]>(`/businesses/${businessId}/portfolio-items/tags`), enabled, staleTime: 30_000 })

export const usePortfolioPreview = (businessId: string) =>
    useQuery({ queryKey: spaceKey(businessId, "portfolio", "preview"), queryFn: () => get<PublicPortfolioDto & { published: boolean }>(`${base(businessId)}/preview`), retry: false, refetchOnWindowFocus: false })

export const usePortfolioHistory = (businessId: string, enabled: boolean) => useQuery({ queryKey: spaceKey(businessId, "portfolio", "history"), queryFn: () => get<PortfolioPublicationDto[]>(`${base(businessId)}/history`), enabled })

export const checkPortfolioSlug = (businessId: string, slug: string) => get<PortfolioSlugCheckDto>(`${base(businessId)}/slug?check=${encodeURIComponent(slug)}`)

/** Salvamento automático do rascunho (sem toast: o editor mostra a situação). */
export const savePortfolioDraft = async (businessId: string, blocks: PortfolioBlock[], draftVersion: number) => unwrapApi((await api.put<ApiResponse<PortfolioDraftSavedDto>>(`${base(businessId)}/draft`, { blocks, draftVersion })).data)

export type PortfolioAction =
    | { kind: "publish" | "unpublish"; version: number }
    | { kind: "slug"; slug: string; version: number }
    | { kind: "settings"; indexable: boolean; version: number }
    | { kind: "publishChanges"; draftVersion: number; version: number; publishPage: boolean }
    | { kind: "discard"; draftVersion: number }
    | { kind: "template"; template: PortfolioTemplate; draftVersion: number }
    | { kind: "restore"; number: number; draftVersion: number }

const SUCCESS: Record<PortfolioAction["kind"], string> = {
    publish: "Página publicada",
    unpublish: "Página despublicada",
    slug: "Endereço alterado",
    settings: "Configuração salva",
    publishChanges: "Alterações publicadas",
    discard: "Rascunho descartado",
    template: "Modelo aplicado",
    restore: "Publicação restaurada como rascunho",
}

async function run(businessId: string, action: PortfolioAction): Promise<PortfolioDto> {
    const call = async (method: "post" | "put" | "patch", path: string, body: unknown) => unwrapApi((await api[method]<ApiResponse<PortfolioDto>>(`${base(businessId)}${path}`, body)).data)
    switch (action.kind) {
        case "publish":
        case "unpublish":
            return call("post", `/${action.kind}`, { version: action.version })
        case "slug":
            return call("put", "/slug", { slug: action.slug, version: action.version })
        case "settings":
            return call("patch", "", { indexable: action.indexable, version: action.version })
        case "publishChanges":
            return call("post", "/publish-changes", { draftVersion: action.draftVersion, version: action.version, publishPage: action.publishPage })
        case "discard":
            return call("post", "/discard-draft", { draftVersion: action.draftVersion })
        case "template":
            return call("post", "/template", { template: action.template, draftVersion: action.draftVersion })
        case "restore":
            return call("post", `/history/${action.number}/restore`, { draftVersion: action.draftVersion })
    }
}

/** Ações do editor; a resposta já é o portfólio atualizado. */
export function usePortfolioAction(businessId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (action: PortfolioAction) => run(businessId, action),
        onSuccess: async (portfolio, action) => {
            queryClient.setQueryData(portfolioKey(businessId), portfolio)
            await queryClient.invalidateQueries({ queryKey: spaceKey(businessId, "portfolio", "history") })
            toast.success(SUCCESS[action.kind])
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível salvar o portfólio")),
    })
}

/** Mídia: acrescentar os enviados e excluir. */
export function usePortfolioMedia(businessId: string) {
    const queryClient = useQueryClient()
    const refresh = () => queryClient.invalidateQueries({ queryKey: portfolioKey(businessId) })
    const add = useMutation({
        mutationFn: async (fileIds: string[]) => unwrapApi((await api.post<ApiResponse<PortfolioMediaDto[]>>(`${base(businessId)}/media`, { fileIds })).data),
        onSuccess: refresh,
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível adicionar a imagem")),
    })
    const remove = useMutation({
        mutationFn: async (fileId: string) => unwrapApi((await api.delete<ApiResponse<{ id: string }>>(`${base(businessId)}/media/${fileId}`)).data),
        onSuccess: async () => {
            await refresh()
            toast.success("Imagem excluída da mídia")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível excluir a imagem")),
    })
    return { add, remove }
}
