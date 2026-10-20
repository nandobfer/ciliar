"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { ViewAsRoleOption, ViewAsUserOption } from "../schemas"

interface Options { roles: ViewAsRoleOption[]; users: ViewAsUserOption[] }
const headers = { "x-perfix-view-as": "none" }

export function useViewAsRoles(enabled: boolean) {
    return useQuery({ queryKey: ["view-as", "roles"], queryFn: async ({ signal }) =>
        (await api.get<{ data: Options }>("/access/view-as", { signal, headers, params: { kind: "roles" } })).data.data.roles,
    enabled })
}

export function useViewAsUsers(search: string, enabled: boolean) {
    const [term, setTerm] = useState(search.trim())
    useEffect(() => { const timer = setTimeout(() => setTerm(search.trim()), 250); return () => clearTimeout(timer) }, [search])
    const query = useQuery({ queryKey: ["view-as", "users", term], queryFn: async ({ signal }) => ({ items:
        (await api.get<{ data: Options }>("/access/view-as", { signal, headers, params: { kind: "users", q: term } })).data.data.users,
    }), enabled })
    return { ...query, term }
}
