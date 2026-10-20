import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { api, apiErrorMessage } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { changePasswordSchema } from "@/features/access/schemas"
import { toast } from "sonner"

export function PasswordChange({ onDone, onLogout }: { onDone: () => void; onLogout: () => void }) {
    const [currentPassword, setCurrent] = useState("")
    const [newPassword, setNew] = useState("")
    const [confirmation, setConfirmation] = useState("")
    const mutation = useMutation({
        mutationFn: async () => {
            const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword })
            if (!parsed.success) throw new Error(parsed.error.issues[0]?.message)
            if (confirmation !== newPassword) throw new Error("As senhas não coincidem")
            await api.post("/me/password", parsed.data)
        },
        onSuccess: () => { setCurrent(""); setNew(""); setConfirmation(""); toast.success("Senha alterada. Entre novamente."); onDone() },
        onError: error => toast.error(apiErrorMessage(error, error.message)),
    })
    return <main className="flex min-h-dvh items-center justify-center p-4"><form className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6" onSubmit={event => { event.preventDefault(); mutation.mutate() }}>
        <h1 className="text-xl font-semibold">Defina sua senha</h1><p className="text-sm text-muted-foreground">Troque a senha inicial para acessar o Ciliar. Todas as sessões serão encerradas.</p>
        <Field id="current-password" label="Senha atual"><Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrent(event.target.value)} disabled={mutation.isPending} /></Field>
        <Field id="new-password" label="Nova senha (12 a 128 caracteres)"><Input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={event => setNew(event.target.value)} disabled={mutation.isPending} /></Field>
        <Field id="confirm-password" label="Confirme a nova senha"><Input id="confirm-password" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={mutation.isPending} /></Field>
        <Button type="submit" disabled={mutation.isPending}>Alterar senha</Button><Button type="button" variant="ghost" onClick={onLogout}>Sair</Button>
    </form></main>
}
