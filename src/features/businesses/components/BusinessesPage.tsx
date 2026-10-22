"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"
import { Archive, ArchiveRestore, ArrowRight, Briefcase, Plus, Trash2 } from "lucide-react"
import { format } from "date-fns"
import { usePermissions } from "@nandobfer/perfix/react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useAppSession } from "@/features/access/components/AccessProvider"
import { BUSINESS_TYPE_LABELS } from "../constants"
import { businessThemeStyle } from "../theme"
import type { BusinessDto } from "../types"
import { useArchiveBusiness, useBusinesses, useBusinessesRealtime, useDeleteBusiness, useRestoreBusiness } from "../hooks/useBusinesses"
import { BusinessAvatar } from "./BusinessAvatar"

type Pending = { kind: "archive" | "delete"; business: BusinessDto } | null

/** `/negocios`: cards dos negócios ativos e arquivados, com arquivar, restaurar e excluir definitivamente. */
export function BusinessesPage() {
    const router = useRouter()
    const reduceMotion = useReducedMotion() ?? false
    const { session } = useAppSession()
    const { can } = usePermissions()
    const canUse = can("businesses.use")
    const canArchive = canUse && can("businesses.archive")
    const canDelete = canUse && can("businesses.delete")
    const canCreate = canUse && can("businesses.create")
    const query = useBusinesses()
    useBusinessesRealtime(session?.user.id ?? null, !session?.access.simulation)
    const archive = useArchiveBusiness()
    const restore = useRestoreBusiness()
    const remove = useDeleteBusiness()
    const [pending, setPending] = useState<Pending>(null)
    const [understood, setUnderstood] = useState(false)

    const capacity = query.data?.capacity
    const active = (query.data?.items ?? []).filter((item) => item.status === "active")
    const archived = (query.data?.items ?? []).filter((item) => item.status === "archived")
    const limitText = capacity ? (capacity.limit === null ? `${capacity.active} ativo(s) · sem limite` : `${capacity.active} de ${capacity.limit} ativo(s)`) : ""

    const card = (business: BusinessDto, index: number) => (
        <motion.div key={business.id} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : index * 0.03 }}>
            <Card
                data-testid={`business-card-${business.id}`}
                style={businessThemeStyle(business.theme)}
                className={cn(
                    "relative flex h-full flex-col gap-3 overflow-hidden border-primary/40 p-4 pt-5 transition-colors hover:border-primary/70",
                    business.status === "archived" && "opacity-80",
                )}
            >
                <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-primary" />
                <div className="flex items-start gap-3">
                    <BusinessAvatar business={business} className="h-11 w-11" />
                    <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{business.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                            {[business.type ? BUSINESS_TYPE_LABELS[business.type] : null, business.subtype, business.segment].filter(Boolean).join(" · ") || "Sem tipo ou área informados"}
                        </p>
                    </div>
                </div>
                {business.status === "archived" && (
                    <p className="text-xs text-warning">
                        Arquivado em {format(new Date(business.archivedAt!), "dd/MM/yyyy")}
                        {business.purgeAt ? ` · exclusão definitiva automática em ${format(new Date(business.purgeAt), "dd/MM/yyyy")}` : ""}
                    </p>
                )}
                <div className="mt-auto flex flex-wrap justify-end gap-2">
                    {business.status === "active" ? (
                        <>
                            {canArchive && (
                                <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setPending({ kind: "archive", business })}>
                                    <Archive className="h-4 w-4" aria-hidden /> Arquivar
                                </Button>
                            )}
                            <Button size="sm" asChild className="gap-1.5">
                                <Link href={`/negocios/${business.id}`}>
                                    Abrir <ArrowRight className="h-4 w-4" aria-hidden />
                                </Link>
                            </Button>
                        </>
                    ) : (
                        <>
                            {canDelete && (
                                <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => { setUnderstood(false); setPending({ kind: "delete", business }) }}>
                                    <Trash2 className="h-4 w-4" aria-hidden /> Excluir definitivamente
                                </Button>
                            )}
                            {canArchive && (
                                <Button size="sm" variant="outline" className="gap-1.5" disabled={restore.isPending || capacity?.vacancy === false} title={capacity?.vacancy === false ? "Sem vaga no limite de negócios ativos" : undefined} onClick={() => restore.mutate(business.id)}>
                                    <ArchiveRestore className="h-4 w-4" aria-hidden /> Restaurar
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </Card>
        </motion.div>
    )

    return (
        <div className="flex flex-col gap-6">
            <CadastroHeader title="Negócios" description={limitText ? `Seus negócios · ${limitText}` : "Seus negócios"}>
                {canCreate && (
                    <div className="flex flex-wrap items-center justify-end gap-3">
                        {capacity && !capacity.vacancy && <p className="text-sm text-warning">Você atingiu o limite de negócios ativos do seu perfil: arquive um para criar outro.</p>}
                        <Button className="h-9 gap-2 px-4" disabled={!capacity?.canCreate} onClick={() => router.push("/negocios/novo")}>
                            <Plus className="h-4 w-4" aria-hidden /> Novo negócio
                        </Button>
                    </div>
                )}
            </CadastroHeader>
            {query.isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-36" />)}</div>
            ) : query.isError ? (
                <ErrorState description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : (
                <>
                    {active.length ? (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{active.map(card)}</div>
                    ) : (
                        <EmptyState icon={Briefcase} title="Nenhum negócio ativo" description="Crie um negócio pela entrevista do Agente Entrevistador." actionLabel={capacity?.canCreate ? "Novo negócio" : undefined} onAction={capacity?.canCreate ? () => router.push("/negocios/novo") : undefined} />
                    )}
                    {archived.length > 0 && (
                        <section className="space-y-3">
                            <h2 className="text-sm font-semibold text-muted-foreground">Arquivados</h2>
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{archived.map(card)}</div>
                        </section>
                    )}
                </>
            )}
            <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{pending?.kind === "delete" ? `Excluir definitivamente "${pending.business.name}"?` : `Arquivar "${pending?.business.name}"?`}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {pending?.kind === "delete"
                                ? "O negócio, as metas, a entrevista e os anexos serão apagados agora. Esta ação é irreversível."
                                : "O negócio some do seletor e deixa de contar no limite. Ele é excluído definitivamente depois do prazo configurado; até lá, pode ser restaurado."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {pending?.kind === "delete" && (
                        <label className="flex items-center gap-2 text-sm">
                            <Checkbox checked={understood} onCheckedChange={(value) => setUnderstood(value === true)} />
                            Entendo que a exclusão é irreversível
                        </label>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={pending?.kind === "delete" && !understood}
                            className={pending?.kind === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
                            onClick={() => {
                                if (!pending) return
                                if (pending.kind === "delete") remove.mutate(pending.business.id)
                                else archive.mutate(pending.business.id)
                                setPending(null)
                            }}
                        >
                            {pending?.kind === "delete" ? "Excluir definitivamente" : "Arquivar"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
