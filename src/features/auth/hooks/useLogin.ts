"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { signIn } from "next-auth/react"
import { syncViewAsCookies, VIEW_AS_STORAGE_KEY } from "@nandobfer/perfix/react"
import { api } from "@/lib/api"
import { resetPusherClient } from "@/lib/pusher/client"
import { credentialsErrorMessage } from "../login-errors"
import type { LoginInput, PasswordSignupInput } from "../schemas"

/** Nada da sessão anterior (simulação, cache, assinaturas) sobrevive à troca de conta. */
export function useResetTabState() {
    const queryClient = useQueryClient()
    return () => {
        sessionStorage.removeItem(VIEW_AS_STORAGE_KEY)
        syncViewAsCookies(null)
        resetPusherClient()
        queryClient.clear()
    }
}

async function credentialsSignIn(input: LoginInput) {
    const result = await signIn("credentials", { ...input, redirect: false })
    if (!result || result.error) throw new Error(credentialsErrorMessage(result?.error))
}

/** Login por e-mail e senha (provider `credentials` do Auth.js). */
export function useLogin() {
    const reset = useResetTabState()
    return useMutation({
        mutationFn: async (input: LoginInput) => {
            reset()
            await credentialsSignIn(input)
        },
    })
}

/** Cadastro público por e-mail e senha e, em seguida, a entrada com a conta criada. */
export function usePasswordSignup() {
    const reset = useResetTabState()
    return useMutation({
        mutationFn: async (input: PasswordSignupInput) => {
            await api.post("/public/auth/signup", input)
            reset()
            await credentialsSignIn({ identifier: input.email, password: input.password })
        },
    })
}
