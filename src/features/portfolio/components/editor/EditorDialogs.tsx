"use client"

import { useState } from "react"
import { format } from "date-fns"
import { History, LayoutTemplate } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { usePortfolioHistory } from "../../hooks/usePortfolio"
import { PORTFOLIO_TEMPLATE_INFO, PORTFOLIO_TEMPLATES, type PortfolioTemplate } from "../../templates"

/** Escolha do modelo (primeira abertura e "Aplicar modelo"). */
export function TemplateDialog({ open, onOpenChange, firstTime, pending, onApply }: { open: boolean; onOpenChange: (open: boolean) => void; firstTime: boolean; pending: boolean; onApply: (template: PortfolioTemplate) => void }) {
    const [choice, setChoice] = useState<PortfolioTemplate>("classic")
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <LayoutTemplate className="h-5 w-5 text-primary" aria-hidden /> {firstTime ? "Como você quer começar?" : "Aplicar um modelo"}
                    </DialogTitle>
                    <DialogDescription>{firstTime ? "Os modelos já vêm montados com o conteúdo do negócio. Depois é só arrastar, editar e publicar." : "O modelo substitui os blocos do rascunho (a página publicada só muda ao publicar). Dá para desfazer com Ctrl+Z."}</DialogDescription>
                </DialogHeader>
                <div role="radiogroup" aria-label="Modelos" className="grid gap-2 sm:grid-cols-2">
                    {PORTFOLIO_TEMPLATES.map((template) => (
                        <button
                            key={template}
                            type="button"
                            role="radio"
                            aria-checked={choice === template}
                            onClick={() => setChoice(template)}
                            className={cn("rounded-lg border p-3 text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none", choice === template && "border-primary bg-primary/10")}
                        >
                            <span className="block font-semibold">{PORTFOLIO_TEMPLATE_INFO[template].label}</span>
                            <span className="block text-xs text-muted-foreground">{PORTFOLIO_TEMPLATE_INFO[template].description}</span>
                        </button>
                    ))}
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" disabled={pending} onClick={() => (firstTime ? onApply("blank") : onOpenChange(false))}>
                        {firstTime ? "Começar em branco" : "Cancelar"}
                    </Button>
                    <Button type="button" disabled={pending} onClick={() => onApply(choice)}>
                        {pending ? "Aplicando..." : firstTime ? "Usar este modelo" : "Aplicar modelo"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/** Histórico de publicações com "Restaurar como rascunho". */
export function HistoryDialog({ businessId, open, onOpenChange, pending, onRestore, readOnly }: { businessId: string; open: boolean; onOpenChange: (open: boolean) => void; pending: boolean; onRestore: (number: number) => void; readOnly: boolean }) {
    const history = usePortfolioHistory(businessId, open)
    const [confirm, setConfirm] = useState<number | null>(null)
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <History className="h-5 w-5 text-primary" aria-hidden /> Histórico de publicações
                    </DialogTitle>
                    <DialogDescription>As últimas 20 versões publicadas. Restaurar troca o rascunho; a página só muda ao publicar.</DialogDescription>
                </DialogHeader>
                {history.isPending ? (
                    <Skeleton className="h-32" />
                ) : history.data?.length ? (
                    <ul className="max-h-[50vh] divide-y overflow-y-auto">
                        {history.data.map((entry) => (
                            <li key={entry.number} className="flex items-center justify-between gap-3 py-2 text-sm">
                                <span className="min-w-0">
                                    <span className="font-medium">Versão {entry.number}</span>
                                    {entry.current && <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">publicada</span>}
                                    <span className="block truncate text-xs text-muted-foreground">
                                        {format(new Date(entry.publishedAt), "dd/MM/yyyy HH:mm")} · {entry.publishedByName ?? (entry.publishedBy === "system" ? "Sistema" : entry.publishedBy)} · {entry.blocks} bloco(s)
                                    </span>
                                </span>
                                {!readOnly && (
                                    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setConfirm(entry.number)}>
                                        Restaurar
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-muted-foreground">Nenhuma publicação ainda.</p>
                )}
                <ConfirmDialog
                    open={confirm !== null}
                    onOpenChange={(value) => !value && setConfirm(null)}
                    title={`Restaurar a versão ${confirm} como rascunho?`}
                    description="Os blocos atuais do rascunho serão substituídos. A página publicada não muda até você publicar."
                    confirmLabel="Restaurar"
                    pending={pending}
                    onConfirm={() => {
                        if (confirm === null) return
                        onRestore(confirm)
                        setConfirm(null)
                    }}
                />
            </DialogContent>
        </Dialog>
    )
}
