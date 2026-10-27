import { useState } from "react"
import { KeyRound, Trash2 } from "lucide-react"
import { Can } from "@nandobfer/perfix/react"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { passwordSchema } from "../schemas"
import { useAccessMutation } from "../hooks/useAccessAdmin"
import type { UserDto } from "../types"

/**
 * Senha de outro usuário (login por e-mail e senha): definir/redefinir ou remover. Encerra as sessões
 * do usuário. A própria senha muda em "Alterar senha", no menu da conta.
 */
export function UserPasswordSection({ user, self }: { user: UserDto; self: boolean }) {
    const save = useAccessMutation()
    const [open, setOpen] = useState(false)
    const [password, setPassword] = useState("")
    const [confirmation, setConfirmation] = useState("")
    const [error, setError] = useState<string | null>(null)
    const has = user.metodos.senha

    const submit = async () => {
        const parsed = passwordSchema.safeParse(password)
        if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Senha inválida")
        if (password !== confirmation) return setError("As senhas não coincidem")
        try {
            await save.mutateAsync({ path: `/users/${user.id}/password`, method: "put", data: { password } })
            setOpen(false); setPassword(""); setConfirmation(""); setError(null)
        } catch { /* conserva o rascunho */ }
    }
    const remove = () => {
        const warning = user.metodos.google ? "" : " Sem Google vinculado, a pessoa deixa de conseguir entrar até receber uma nova senha."
        if (window.confirm(`Remover a senha de ${user.nome}? As sessões abertas serão encerradas.${warning}`)) save.mutate({ path: `/users/${user.id}/password`, method: "delete" })
    }

    return (
        <div className="space-y-3 rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                    <span className="font-medium">Senha</span>
                    <span className="block text-xs text-muted-foreground">
                        {has ? "Tem senha para entrar com e-mail e senha." : "Sem senha: entra só com o Google."} {user.metodos.google ? "Google vinculado." : "Google não vinculado."}
                    </span>
                </span>
                {self ? (
                    <span className="text-xs text-muted-foreground">Use &quot;Alterar senha&quot; no menu da sua conta.</span>
                ) : (
                    <Can permission="users.edit">
                        <span className="flex gap-2">
                            <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={save.isPending || open} onClick={() => setOpen(true)}><KeyRound className="h-4 w-4" aria-hidden />{has ? "Redefinir senha" : "Definir senha"}</Button>
                            {has && <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={save.isPending} onClick={remove}><Trash2 className="h-4 w-4" aria-hidden />Remover senha</Button>}
                        </span>
                    </Can>
                )}
            </div>
            {open && !self && (
                <div className="space-y-3">
                    <Field id="user-new-password" label="Nova senha (12 a 128 caracteres)" error={error ?? undefined}><Input id="user-new-password" type="password" autoComplete="new-password" value={password} onChange={event => { setPassword(event.target.value); setError(null) }} disabled={save.isPending} /></Field>
                    <Field id="user-new-password-confirm" label="Confirme a senha"><Input id="user-new-password-confirm" type="password" autoComplete="new-password" value={confirmation} onChange={event => { setConfirmation(event.target.value); setError(null) }} disabled={save.isPending} /></Field>
                    <p className="text-xs text-muted-foreground">Salvar encerra as sessões abertas desta pessoa.</p>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" disabled={save.isPending} onClick={() => { setOpen(false); setPassword(""); setConfirmation(""); setError(null) }}>Cancelar</Button>
                        <Button type="button" size="sm" disabled={save.isPending} onClick={() => void submit()}>Salvar senha</Button>
                    </div>
                </div>
            )}
        </div>
    )
}
