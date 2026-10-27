"use client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage } from "@/lib/api"
import type { InviteResult, RoleDto, UserDto } from "../types"

export type AssignableRole = RoleDto & { bloqueado: boolean; motivo?: string }
export type RoleDetail = RoleDto & { membros: string[]; membrosNomes: { id: string; nome: string }[]; audit: { id: string; action: string; actorId: string; createdAt: string; simulation: unknown }[] }
export function useUsers(enabled = true) {
    return useQuery({ queryKey: ["users"], enabled, queryFn: async ({ signal }) => (await api.get<{ data: UserDto[] }>("/users", { signal })).data.data })
}
export function useAssignableRoles(enabled: boolean) {
    return useQuery({ queryKey: ["assignable-roles"], enabled, queryFn: async ({ signal }) => (await api.get<{ data: AssignableRole[] }>("/users/assignable-roles", { signal })).data.data })
}
export function useRoles() {
    return useQuery({ queryKey: ["roles"], queryFn: async ({ signal }) => (await api.get<{ data: { roles: (RoleDto & { usuariosCount: number })[]; hierarchyVersion: number } }>("/roles", { signal })).data.data })
}
export function useRole(id?: string) {
    return useQuery({ queryKey: ["roles", id], enabled: !!id, queryFn: async ({ signal }) => (await api.get<{ data: RoleDetail }>(`/roles/${id}`, { signal })).data.data })
}
/** Convite por e-mail disponível (SMTP configurado)? */
export function useInviteStatus(enabled: boolean) {
    return useQuery({ queryKey: ["users", "invite-status"], enabled, queryFn: async ({ signal }) => (await api.get<{ data: { smtpConfigured: boolean } }>("/users/invite", { signal })).data.data })
}
export function useResendInvite() {
    return useMutation({
        mutationFn: async (id: string) => (await api.post<{ data: { id: string; convite: InviteResult } }>(`/users/${id}/invite`)).data.data,
        onSuccess: () => toast.success("Convite reenviado por e-mail"),
        onError: error => toast.error(apiErrorMessage(error, "Não foi possível reenviar o convite")),
    })
}
export function useAccessMutation() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async ({ path, method, data }: { path: string; method: "post" | "patch" | "put" | "delete"; data?: unknown }) => (await api.request({ url: path, method, data })).data,
        onSuccess: async () => {
            await Promise.all(["users", "roles", "assignable-roles", "session", "view-as-options"].map(key => client.invalidateQueries({ queryKey: [key] })))
            toast.success("Alteração salva")
        },
        onError: error => toast.error(apiErrorMessage(error)),
    })
}
