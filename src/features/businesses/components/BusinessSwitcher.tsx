"use client"

import { forwardRef, useMemo, type ComponentPropsWithoutRef } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Check, ChevronsUpDown, LayoutGrid, Plus } from "lucide-react"
import { SearchPicker } from "@/components/ui/search-picker"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { withBasePath } from "@/lib/base-path"
import { useAppSession } from "@/features/access/components/AccessProvider"
import { useBusiness, useBusinesses, useBusinessesRealtime } from "../hooks/useBusinesses"
import { formatAccessTime, searchBusinesses, sortByRecentAccess } from "../recent-access"
import { readableForeground, resolveTheme } from "../theme"
import type { BusinessDto } from "../types"

/** Negócio ativo na URL (`/negocios/[id]`). */
export const activeBusinessId = (pathname: string) => /^\/negocios\/([a-f\d]{24})(?:\/|$)/i.exec(pathname)?.[1] ?? null

const AVATAR_SIZES = {
    xs: "h-5 w-5 rounded-[4px] text-[9px]",
    sm: "h-8 w-8 rounded-[6px] text-[11px]",
} as const

const initials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]!.toUpperCase())
        .join("") || "N"

/** Avatar do seletor (cópia do `CompanyAvatar` do crm): logo ou iniciais na cor de CADA negócio. */
export function SwitcherAvatar({ business, size }: { business: Pick<BusinessDto, "name" | "logo" | "theme">; size: keyof typeof AVATAR_SIZES }) {
    if (business.logo) {
        // eslint-disable-next-line @next/next/no-img-element -- imagem privada servida pela API autenticada
        return <img src={withBasePath(business.logo.url)} alt="" aria-hidden className={cn("shrink-0 border border-border bg-white object-contain p-0.5", AVATAR_SIZES[size])} />
    }
    const theme = resolveTheme(business.theme)
    return (
        <span
            aria-hidden
            data-testid="business-avatar"
            className={cn("flex shrink-0 items-center justify-center font-bold", AVATAR_SIZES[size])}
            style={{ backgroundColor: theme.primary, color: readableForeground(theme.primary) ?? "#FFFFFF" }}
        >
            {initials(business.name)}
        </span>
    )
}

/**
 * Seletor de negócio no início do caminho do cabeçalho — cópia do `CompanySwitcher` do
 * crm-marketing-campanhas. Trocar de negócio = navegar para `/negocios/[id]`. Lista os negócios ativos
 * do último acessado (usuário real) para o mais antigo, com busca sem acento nem maiúsculas; no rodapé,
 * "Novo negócio" (indisponível no limite do perfil, com o aviso) e "Ver todos os negócios".
 */
export function BusinessSwitcher() {
    const router = useRouter()
    const pathname = usePathname()
    const { session } = useAppSession()
    const query = useBusinesses()
    useBusinessesRealtime(session?.user.id ?? null, !session?.access.simulation)
    const items = query.data?.items
    const businesses = useMemo(() => sortByRecentAccess((items ?? []).filter((item) => item.status === "active")), [items])
    const currentId = activeBusinessId(pathname)
    // Arquivado ou de outro usuário (suporte) não entra na lista, mas aparece no caminho.
    const detail = useBusiness(currentId)
    const current = (items ?? []).find((item) => item.id === currentId) ?? (detail.data?.id === currentId ? detail.data : undefined)
    const label = current?.name ?? "Escolher negócio"
    const capacity = query.data?.capacity
    const { refetch } = query

    if (query.isLoading) {
        return (
            <span className="flex min-w-0 items-center gap-2 px-1.5 text-xs font-medium text-muted-foreground">
                <Skeleton className="h-5 w-5 rounded-[4px]" />
                <span className="hidden max-w-[200px] truncate sm:inline">{label}</span>
            </span>
        )
    }

    return (
        <SearchPicker<BusinessDto>
            trigger={<SwitcherTrigger business={current} label={label} />}
            items={businesses}
            getKey={(business) => business.id}
            filterItems={searchBusinesses}
            onOpenChange={(open) => {
                // O último acesso muda a cada troca de negócio: a ordem é recarregada ao abrir.
                if (open) void refetch()
            }}
            onPick={(business) => {
                if (business.id !== currentId) router.push(`/negocios/${business.id}`)
            }}
            renderItem={(business) => (
                <>
                    <SwitcherAvatar business={business} size="sm" />
                    <span className="flex min-w-0 flex-1 flex-col">
                        <span className={cn("truncate text-sm", business.id === currentId ? "font-semibold" : "font-medium")}>{business.name}</span>
                        <span className="truncate text-[11px] text-muted-foreground">
                            {business.id === currentId ? "Negócio atual" : business.lastAccessedAt ? `Acessado ${formatAccessTime(business.lastAccessedAt)}` : "Nunca acessado"}
                        </span>
                    </span>
                    {business.id === currentId && <Check className="h-4 w-4 shrink-0 text-primary" aria-label="Negócio atual" />}
                </>
            )}
            placeholder="Buscar negócio"
            searchLabel="Buscar negócio"
            listLabel="Seus negócios, do último acessado para o mais antigo"
            emptyText="Nenhum negócio ativo."
            emptySearchText="Nenhum negócio encontrado."
            align="start"
            contentClassName="w-[min(340px,calc(100vw-2rem))]"
            footer={
                <>
                    {capacity?.canCreate || capacity?.vacancy === false ? (
                        <Link
                            href="/negocios/novo"
                            aria-disabled={!capacity.canCreate}
                            onClick={(event) => {
                                if (!capacity.canCreate) event.preventDefault()
                            }}
                            className={cn(
                                "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm font-medium text-primary hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                                !capacity.canCreate && "pointer-events-none opacity-50",
                            )}
                        >
                            <Plus className="h-4 w-4" aria-hidden />
                            Novo negócio
                        </Link>
                    ) : null}
                    {capacity?.canCreate === false && !capacity.vacancy && <p className="px-2 pb-1 text-[11px] text-warning">Limite de negócios ativos do seu perfil atingido: arquive um para criar outro.</p>}
                    <Link
                        href="/negocios"
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm font-medium text-primary hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    >
                        <LayoutGrid className="h-4 w-4" aria-hidden />
                        Ver todos os negócios
                    </Link>
                </>
            }
        />
    )
}

interface SwitcherTriggerProps extends ComponentPropsWithoutRef<"button"> {
    business?: BusinessDto
    label: string
}

/** Gatilho do seletor; recebe do popover o estado aberto (`data-state`) e os eventos. */
const SwitcherTrigger = forwardRef<HTMLButtonElement, SwitcherTriggerProps>(function SwitcherTrigger({ business, label, className, ...props }, ref) {
    return (
        <button
            ref={ref}
            type="button"
            aria-label={`Trocar de negócio (atual: ${label})`}
            className={cn(
                "group flex min-w-0 items-center gap-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "-ml-1 h-8 rounded-[6px] px-1.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground",
                className,
            )}
            {...props}
        >
            {business ? <SwitcherAvatar business={business} size="xs" /> : <LayoutGrid className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            <span className="hidden max-w-[200px] truncate sm:inline">{label}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60 transition-transform group-data-[state=open]:scale-110" aria-hidden />
        </button>
    )
})
