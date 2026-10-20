"use client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { signIn } from "next-auth/react"
import type { LoginInput } from "../schemas"
import { syncViewAsCookies, VIEW_AS_STORAGE_KEY } from "@nandobfer/perfix/react"
import { resetPusherClient } from "@/lib/pusher/client"

export function useLogin() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: LoginInput) => {
            const result = await signIn("credentials", { ...input, redirect: false })
            if (!result || result.error) throw new Error("E-mail ou senha incorretos, ou acesso indisponível.")
            sessionStorage.removeItem(VIEW_AS_STORAGE_KEY)
            syncViewAsCookies(null)
            resetPusherClient()
            queryClient.clear()
            return { redirectTo: "/integracoes" }
        },
    })
}
