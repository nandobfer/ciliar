"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

export const createAppQueryClient = () => new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 60 * 1000,
                        gcTime: 5 * 60 * 1000,
                        retry: false,
                        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
                        refetchOnWindowFocus: false,
                        refetchOnMount: true,
                    },
                    // Mutação não repete: escrita não é idempotente (lição do Smart Desk).
                    mutations: {
                        retry: 0,
                    },
                },
            })

export function QueryProvider({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(createAppQueryClient)

    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
