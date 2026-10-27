"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { changePasswordSchema } from "@/features/access/schemas"

/**
 * "Alterar senha" (ou "Criar senha", para quem só tem Google) da própria conta — do `PasswordChange`
 * da base do Opex. Todas as sessões são encerradas: depois é preciso entrar de novo.
 */
export function PasswordChangeDialog({ hasPassword, onClose, onDone }: { hasPassword: boolean; onClose: () => void; onDone: () => void }) {
    const [currentPassword, setCurrent] = useState("")
    const [newPassword, setNew] = useState("")
    const [confirmation, setConfirmation] = useState("")
    const mutation = useMutation({
        mutationFn: async () => {
            const parsed = changePasswordSchema.safeParse({ ...(hasPassword ? { currentPassword } : {}), newPassword })
            if (!parsed.success) throw new Error(parsed.error.issues[0]?.message)
            if (confirmation !== newPassword) throw new Error("As senhas não coincidem")
            await api.post("/me/password", parsed.data)
        },
        onSuccess: () => { setCurrent(""); setNew(""); setConfirmation(""); toast.success("Senha salva. Entre novamente."); onDone() },
        onError: error => toast.error(apiErrorMessage(error, error.message)),
    })
    const title = hasPassword ? "Alterar senha" : "Criar senha"
    return (
        <Dialog open onOpenChange={open => { if (!open && !mutation.isPending) onClose() }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{hasPassword ? "Troque a senha de acesso por e-mail e senha." : "Crie uma senha para entrar também com e-mail e senha."} Todas as sessões serão encerradas.</DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={event => { event.preventDefault(); mutation.mutate() }}>
                    {hasPassword && <Field id="current-password" label="Senha atual"><Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrent(event.target.value)} disabled={mutation.isPending} /></Field>}
                    <Field id="new-password" label="Nova senha"><Input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={event => setNew(event.target.value)} disabled={mutation.isPending} /></Field>
                    <Field id="confirm-password" label="Confirme a nova senha"><Input id="confirm-password" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={mutation.isPending} /></Field>
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>Cancelar</Button>
                        <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Salvando..." : title}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
