"use client"
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { PermissionsProvider, ViewAsProvider, useViewAs, getViewAsHeaderValue, syncViewAsCookies, VIEW_AS_STORAGE_KEY } from "@nandobfer/perfix/react"
import { QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query"
import { createAppQueryClient } from "@/lib/react-query/QueryProvider"
import { signOut } from "next-auth/react"
import { toast } from "sonner"
import { api, apiErrorCode, apiErrorMessage } from "@/lib/api"
import { resetPusherClient } from "@/lib/pusher/client"
import { LegalAcceptance } from "@/features/platform/components/LegalAcceptance"
import type { SessionDto } from "../types"
import { AccessLoadingScreen } from "./AccessLoadingScreen"
import { ViewAsControls } from "./ViewAsControls"

const SessionContext = createContext<{ session: SessionDto | null; logout: () => void }>({ session: null, logout: () => {} })
const subscribeHydration = () => () => {}
export const useAppSession = () => useContext(SessionContext)

export function AccessProvider({ children }: { children: ReactNode }) {
    const queryClient = useQueryClient()
    const router = useRouter()
    return <ViewAsProvider onChange={change => {
        resetPusherClient()
        void queryClient.cancelQueries().then(() => { queryClient.clear(); router.replace("/integracoes"); router.refresh() })
        void api.post("/access/view-as", { kind: change.kind, previous: change.previous?.viewAs ?? null, next: change.next?.viewAs ?? null }, { headers: { "x-perfix-view-as": "none" } }).catch(() => toast.error("Não foi possível registrar a troca da simulação"))
    }}><SessionBoundary>{children}</SessionBoundary></ViewAsProvider>
}

function SessionBoundary({ children }: { children: ReactNode }) {
    const mounted = useSyncExternalStore(subscribeHydration, () => true, () => false)
    const router = useRouter()
    const pathname = usePathname()
    const queryClient = useQueryClient()
    const simulation = useViewAs()
    const header = mounted ? getViewAsHeaderValue() : "pending"
    const query = useQuery({
        queryKey: ["session", header], enabled: mounted,
        queryFn: async ({ signal }) => (await api.get<{ data: SessionDto }>("/me", { signal })).data.data,
        staleTime: 0, retry: false, refetchOnWindowFocus: true, refetchInterval: 30_000,
    })
    const leave = useCallback(async (callServer = true) => {
        await queryClient.cancelQueries()
        queryClient.clear()
        resetPusherClient()
        sessionStorage.removeItem(VIEW_AS_STORAGE_KEY)
        syncViewAsCookies(null)
        if (callServer) await signOut({ redirect: false }).catch(() => undefined)
        window.location.assign("/login")
    }, [queryClient])
    useEffect(() => {
        const unauthorized = () => { void leave(false) }
        window.addEventListener("ciliar:unauthorized", unauthorized)
        return () => window.removeEventListener("ciliar:unauthorized", unauthorized)
    }, [leave])
    useEffect(() => {
        if (!query.error) return
        const code = apiErrorCode(query.error)
        if (code === "VIEW_AS_INVALID" || code === "VIEW_AS_FORBIDDEN") { simulation.stop(); toast.warning("Simulação encerrada: alvo ou autorização indisponível.") }
        if (code === "UNAUTHORIZED") void leave(false)
    }, [query.error, simulation, leave])
    useEffect(() => {
        const listener = () => { void query.refetch() }
        window.addEventListener("ciliar:terms-required", listener)
        return () => window.removeEventListener("ciliar:terms-required", listener)
    }, [query])

    if (!mounted || query.isPending) return <AccessLoadingScreen />
    if (query.isError || !query.data) return <div className="space-y-3 p-8"><p role="alert">{apiErrorMessage(query.error, "Não foi possível validar seu acesso")}</p><button onClick={() => void query.refetch()}>Tentar novamente</button><button onClick={() => void leave()}>Sair</button></div>
    const session = query.data
    // Nova versão dos termos/política: só aceitar ou sair (o servidor bloqueia o resto até o aceite).
    if (session.user.legalAcceptanceRequired) return <LegalAcceptance onDone={() => void query.refetch()} onLogout={() => void leave()} />
    const can = (key: string) => session.access.permissions.includes("*") || session.access.permissions.includes(key)
    const routeKey = pathname.startsWith("/usuarios") ? "users.view" : pathname.startsWith("/perfis") ? "roles.view" : null
    const permitted = can("admin.access") && (!routeKey || can(routeKey))
    return <SessionContext.Provider value={{ session, logout: () => void leave() }}>
        <AccessDataScope key={`${session.user.id}:${session.access.permissions.join(",")}:${session.access.roles.map(role => `${role.id}:${role.posicao}:${role.version}`).join(",")}:${header}`}>
        <PermissionsProvider permissions={session.access.permissions} roles={session.access.roles} realIsAdmin={session.access.realIsAdministrator}>
            <div className="flex h-dvh flex-col">
            <div className="min-h-0 flex-1" key={`${session.user.id}:${session.access.permissions.join(",")}:${header}`}>
                {permitted ? children : <div className="flex h-full flex-col"><ViewAsControls /><main className="space-y-4 p-8"><h1 className="text-xl font-semibold">Sem acesso</h1><p>Seu perfil não permite acessar esta área.</p><button onClick={() => { router.replace("/integracoes") }}>Voltar</button><button onClick={() => void leave()}>Sair</button></main></div>}
            </div>
            </div>
        </PermissionsProvider>
        </AccessDataScope>
    </SessionContext.Provider>
}

/** Um cache novo por identidade/permissões/contexto: nenhum frame reutiliza dados privilegiados. */
function AccessDataScope({ children }: { children: ReactNode }) {
    const [client] = useState(createAppQueryClient)
    useEffect(() => () => { void client.cancelQueries(); client.clear(); resetPusherClient() }, [client])
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
