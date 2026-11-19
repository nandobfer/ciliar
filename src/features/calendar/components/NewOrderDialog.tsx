"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Briefcase } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useBusiness } from "@/features/businesses/hooks/useBusinesses"
import { dateKeyLabel } from "@/features/orders/components/OrderBadges"
import { OrderForm } from "@/features/orders/components/OrderForm"
import { useSaveOrder } from "@/features/orders/hooks/useOrders"
import type { CalendarBusinessDto } from "../types"
import { CALENDAR_KEY } from "../hooks/useCalendar"

/** Negócio pré-selecionado: o da aba; senão o filtrado (se aceitar pedidos); senão o único que aceita. */
export function initialOrderBusiness(creatable: readonly Pick<CalendarBusinessDto, "id">[], initialBusinessId: string | null, preferredBusinessId: string | null): string | null {
    if (initialBusinessId) return initialBusinessId
    if (preferredBusinessId && creatable.some((business) => business.id === preferredBusinessId)) return preferredBusinessId
    return creatable.length === 1 ? creatable[0]!.id : null
}

/**
 * Novo pedido pelo calendário: diálogo com o `OrderForm` (o mesmo da tela de pedidos) já com o negócio
 * (o da aba; na página global, o filtrado vem pré-selecionado, ou escolhido se houver vários) e o prazo = data clicada. O pedido nasce em Rascunho e
 * segue o fluxo normal (só vira trabalho quando aceito).
 */
export function NewOrderDialog({ date, businesses, initialBusinessId, preferredBusinessId = null, onClose }: { date: string; businesses: readonly CalendarBusinessDto[]; initialBusinessId: string | null; preferredBusinessId?: string | null; onClose: () => void }) {
    const creatable = businesses.filter((business) => business.canCreateOrders)
    const [businessId, setBusinessId] = useState<string | null>(() => initialOrderBusiness(creatable, initialBusinessId, preferredBusinessId))
    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Novo pedido</DialogTitle>
                    <DialogDescription>Rascunho com prazo em {dateKeyLabel(date)}: envie ao cliente quando estiver pronto. Ele só vira trabalho quando for aceito.</DialogDescription>
                </DialogHeader>
                {!initialBusinessId && creatable.length > 1 && (
                    <Field id="calendar-order-business" label="Negócio">
                        <Select value={businessId ?? undefined} onValueChange={setBusinessId}>
                            <SelectTrigger id="calendar-order-business" aria-label="Negócio do pedido">
                                <Briefcase className="mr-2 h-4 w-4 text-primary opacity-60" aria-hidden />
                                <SelectValue placeholder="Escolha o negócio" />
                            </SelectTrigger>
                            <SelectContent>
                                {creatable.map((business) => (
                                    <SelectItem key={business.id} value={business.id}>
                                        <span className="inline-flex items-center gap-2">
                                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: business.color }} aria-hidden />
                                            {business.name}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                )}
                {!creatable.length && <p className="text-sm text-muted-foreground">Nenhum negócio ativo aceita novos pedidos com o seu perfil.</p>}
                {businessId && <NewOrderForm key={businessId} businessId={businessId} date={date} onClose={onClose} />}
            </DialogContent>
        </Dialog>
    )
}

function NewOrderForm({ businessId, date, onClose }: { businessId: string; date: string; onClose: () => void }) {
    const queryClient = useQueryClient()
    const business = useBusiness(businessId)
    const save = useSaveOrder(businessId)
    if (business.isPending) return <Skeleton className="h-80 w-full" />
    if (business.isError || !business.data) return <ErrorState title="Negócio indisponível" description={apiErrorMessage(business.error, "Tente de novo.")} onRetry={() => void business.refetch()} />
    return (
        <OrderForm
            business={business.data}
            order={null}
            readOnly={false}
            pending={save.isPending}
            initialDueDate={date}
            onCancel={onClose}
            onSubmit={async (data) => {
                const order = await save.mutateAsync({ data }).catch(() => null)
                if (!order) return false
                await queryClient.invalidateQueries({ queryKey: [CALENDAR_KEY] })
                onClose()
                return true
            }}
        />
    )
}
