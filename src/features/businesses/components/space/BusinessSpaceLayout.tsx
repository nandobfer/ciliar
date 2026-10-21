"use client"

import { createContext, useContext, useLayoutEffect, type ReactNode } from "react"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArchiveRestore, Eye } from "lucide-react"
import { format } from "date-fns"
import { usePermissions } from "@nandobfer/perfix/react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { APP_SCROLL_CONTAINER_ID } from "@/hooks/usePageVirtualizer"
import { useAppSession } from "@/features/access/components/AccessProvider"
import { BUSINESS_TYPE_LABELS, businessSpaceHref } from "../../constants"
import { businessThemeStyle } from "../../theme"
import type { BusinessDetailDto } from "../../types"
import { useBusiness, useRestoreBusiness } from "../../hooks/useBusinesses"
import { useBusinessSpaceRealtime } from "../../hooks/useBusinessSpace"
import { BusinessAvatar } from "../BusinessAvatar"
import { useThemePreview } from "./theme-preview"

interface BusinessSpaceValue {
    business: BusinessDetailDto
    /** Dono com `businesses.use` e negócio ativo; suporte e arquivado são somente leitura. */
    editable: boolean
}

const BusinessSpaceContext = createContext<BusinessSpaceValue | null>(null)

export function useBusinessSpace(): BusinessSpaceValue {
    const value = useContext(BusinessSpaceContext)
    if (!value) throw new Error("useBusinessSpace fora do BusinessSpaceLayout")
    return value
}

/** Tipo, subtipo e área do negócio (ou "Espaço do negócio"). */
export function businessSubtitle(business: Pick<BusinessDetailDto, "type" | "subtype" | "segment">): string {
    return [business.type ? BUSINESS_TYPE_LABELS[business.type] : null, business.subtype, business.segment].filter(Boolean).join(" · ") || "Espaço do negócio"
}

/**
 * Layout do espaço do negócio (`/negocios/[id]/…`): carrega a ficha, aplica o tema no contêiner
 * (a regra `:root` fica no `BusinessThemeController`), mostra a identidade do negócio e os avisos de
 * somente leitura (suporte) e de arquivado (com Restaurar). As páginas leem o negócio pelo contexto.
 */
export function BusinessSpaceLayout({ id, children }: { id: string; children: ReactNode }) {
    const pathname = usePathname()
    const reduceMotion = useReducedMotion() ?? false
    const { session } = useAppSession()
    const { can } = usePermissions()
    const query = useBusiness(id)
    const restore = useRestoreBusiness()
    const preview = useThemePreview()
    useBusinessSpaceRealtime(session?.user.id ?? null, !session?.access.simulation)

    // As páginas do espaço compartilham o `<main>` da casca (`persistentHrefs`): sem isto a página nova
    // herdaria a rolagem da anterior. Os links do espaço usam `scroll={false}` (o Next não rola até o segmento).
    useLayoutEffect(() => {
        document.getElementById(APP_SCROLL_CONTAINER_ID)?.scrollTo({ top: 0 })
    }, [pathname])

    if (query.isLoading) {
        return (
            <div className="flex flex-col gap-6">
                <Skeleton className="h-14 w-72" />
                <Skeleton className="h-64 w-full" />
            </div>
        )
    }
    if (query.isError || !query.data) {
        return <ErrorState title="Negócio não encontrado" description={apiErrorMessage(query.error, "Ele pode ter sido excluído, ou você não tem acesso a ele.")} onRetry={() => void query.refetch()} />
    }

    const business = query.data
    const theme = preview?.businessId === business.id ? preview.theme : business.theme
    const archived = business.status === "archived"

    return (
        <BusinessSpaceContext.Provider value={{ business, editable: business.editable }}>
            <div style={businessThemeStyle(theme)} className="flex flex-col gap-6">
                {/* No dashboard o nome do negócio é o título da página (ver `BusinessDashboardPage`). */}
                {pathname !== businessSpaceHref(business.id) && (
                    <div className="flex items-center gap-3">
                        <BusinessAvatar business={business} className="h-11 w-11" />
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{business.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{businessSubtitle(business)}</p>
                        </div>
                    </div>
                )}
                {!business.own && (
                    <Alert>
                        <Eye className="h-4 w-4" aria-hidden />
                        <AlertTitle>Somente leitura</AlertTitle>
                        <AlertDescription>
                            Negócio de {business.ownerName ?? "outro usuário"}, aberto pelo suporte (businesses.view_all). Nada pode ser alterado e o acesso fica registrado na auditoria.
                        </AlertDescription>
                    </Alert>
                )}
                {business.own && archived && (
                    <Alert className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <AlertTitle>Negócio arquivado</AlertTitle>
                            <AlertDescription>
                                Somente leitura até restaurar.
                                {business.purgeAt ? ` Exclusão definitiva automática em ${format(new Date(business.purgeAt), "dd/MM/yyyy")}.` : ""}
                            </AlertDescription>
                        </div>
                        {can("businesses.use") && (
                            <Button size="sm" variant="outline" className="gap-1.5" disabled={restore.isPending} onClick={() => restore.mutate(business.id)}>
                                <ArchiveRestore className="h-4 w-4" aria-hidden /> Restaurar
                            </Button>
                        )}
                    </Alert>
                )}
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={pathname}
                        initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
                        transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
                        className="flex flex-col gap-6"
                    >
                        {children}
                    </motion.div>
                </AnimatePresence>
            </div>
        </BusinessSpaceContext.Provider>
    )
}
