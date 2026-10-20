import { useEffect, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"
import { createUserSchema, updateUserSchema } from "../schemas"
import { useAccessMutation, useAssignableRoles } from "../hooks/useAccessAdmin"
import { useAppSession } from "./AccessProvider"
import type { UserDto } from "../types"

const formSchema = createUserSchema.extend({ password: z.string(), confirmacao: z.string() }).superRefine((data, context) => {
    if (data.password && (data.password.length < 12 || data.password.length > 128)) context.addIssue({ code: "custom", path: ["password"], message: "Use de 12 a 128 caracteres" })
    if (data.password !== data.confirmacao) context.addIssue({ code: "custom", path: ["confirmacao"], message: "As senhas não coincidem" })
})
type Values = z.infer<typeof formSchema>
export function UserEditor({ user, onClose }: { user?: UserDto; onClose: () => void }) {
    const { session } = useAppSession()
    const self = user?.id === session?.user.id
    const [tab, setTab] = useState("geral")
    const roles = useAssignableRoles(true)
    const save = useAccessMutation()
    const form = useForm<Values>({ resolver: zodResolver(formSchema), defaultValues: { nome: user?.nome ?? "", email: user?.email ?? "", password: "", confirmacao: "", ativo: user?.ativo ?? true, cargos: user?.roleIds ?? [] } })
    const { errors, isDirty } = form.formState
    useEffect(() => {
        const handler = (event: BeforeUnloadEvent) => { if (isDirty) { event.preventDefault(); event.returnValue = "" } }
        window.addEventListener("beforeunload", handler)
        return () => window.removeEventListener("beforeunload", handler)
    }, [isDirty])
    const close = () => { if (!save.isPending && (!isDirty || window.confirm("Descartar as alterações do usuário?"))) onClose() }
    const submit = form.handleSubmit(async values => {
        const raw = user ? { nome: values.nome, ativo: values.ativo, cargos: values.cargos, version: user.version } : { nome: values.nome, email: values.email, password: values.password, ativo: values.ativo, cargos: values.cargos }
        const parsed = user ? updateUserSchema.safeParse(raw) : createUserSchema.safeParse(raw)
        if (!parsed.success) {
            const issue = parsed.error.issues[0]!
            form.setError(issue.path[0] as keyof Values, { message: issue.message }); setTab(issue.path[0] === "cargos" ? "perfis" : "geral"); return
        }
        try {
            await save.mutateAsync({ path: user ? `/users/${user.id}` : "/users", method: user ? "patch" : "post", data: parsed.data })
            form.reset(); onClose()
        } catch { /* conserva o rascunho */ }
    }, errors => setTab(errors.cargos && !errors.nome && !errors.email && !errors.password ? "perfis" : "geral"))
    const selected = useWatch({ control: form.control, name: "cargos" })
    const active = useWatch({ control: form.control, name: "ativo" })
    // Mantém referências inativas/bloqueadas existentes; a API valida somente o delta.
    const options = [...roles.data ?? [], ...user?.cargos.filter(role => !roles.data?.some(option => option.id === role.id)).map(role => ({ ...role, bloqueado: true, motivo: "Perfil indisponível para novas atribuições" })) ?? []]
    return <Dialog open onOpenChange={open => { if (!open) close() }}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{user ? "Editar Usuário" : "Novo Usuário"}</DialogTitle><DialogDescription>{user ? "Dados e atribuições de acesso" : "Defina a senha inicial. O usuário deverá trocá-la no primeiro acesso."}</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-5" noValidate>
            <Tabs value={tab} onValueChange={setTab}><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="geral">Geral</TabsTrigger><TabsTrigger value="perfis">Perfis</TabsTrigger></TabsList>
                <TabsContent value="geral" className="space-y-4 pt-4">
                    <Field id="user-name" label="Nome" error={errors.nome?.message}><Input id="user-name" autoComplete="name" {...form.register("nome")} disabled={save.isPending} /></Field>
                    <Field id="user-email" label="E-mail" error={errors.email?.message}><Input id="user-email" type="email" autoComplete="email" {...form.register("email")} disabled={!!user || save.isPending} /></Field>
                    {!user && <>
                        <Field id="user-password" label="Senha inicial (12 a 128 caracteres)" error={errors.password?.message}><Input id="user-password" type="password" autoComplete="new-password" {...form.register("password")} disabled={save.isPending} /></Field>
                        <Field id="user-confirm" label="Confirme a senha" error={errors.confirmacao?.message}><Input id="user-confirm" type="password" autoComplete="new-password" {...form.register("confirmacao")} disabled={save.isPending} /></Field>
                    </>}
                    <label className="flex items-center gap-2 text-sm"><Checkbox checked={active} onCheckedChange={checked => form.setValue("ativo", checked === true, { shouldDirty: true })} disabled={self || save.isPending} />Usuário ativo</label>
                </TabsContent>
                <TabsContent value="perfis" className="space-y-3 pt-4">
                    {roles.isPending && <p>Carregando perfis...</p>}{roles.isError && <p role="alert">Não foi possível carregar os perfis. <button type="button" onClick={() => void roles.refetch()}>Tentar novamente</button></p>}
                    {options.map(role => <label key={role.id} className="flex items-start gap-3 rounded-lg border p-3 text-sm"><Checkbox checked={selected.includes(role.id)} disabled={self || role.bloqueado || save.isPending} onCheckedChange={checked => form.setValue("cargos", checked ? [...selected, role.id] : selected.filter(id => id !== role.id), { shouldDirty: true })} /><span><span className="font-medium">{role.nome}</span><span className="block text-xs text-muted-foreground">{role.motivo ?? role.descricao}</span></span></label>)}
                    {errors.cargos && <p role="alert" className="text-sm text-destructive">{errors.cargos.message}</p>}
                    {self && <p className="text-sm text-muted-foreground">Não é permitido alterar seus próprios perfis.</p>}
                </TabsContent>
            </Tabs>
            <DialogFooter><Button type="button" variant="outline" disabled={save.isPending} onClick={close}>Cancelar</Button>
                {tab === "geral" && !user ? <Button key="advance" type="button" onClick={() => { void form.trigger(["nome", "email", "password", "confirmacao"]).then(ok => { if (ok && form.getValues("password")) setTab("perfis"); else if (!form.getValues("password")) form.setError("password", { message: "Informe a senha inicial" }) }) }}>Definir Perfis</Button> : <Button key="save" type="submit" disabled={save.isPending || roles.isPending || roles.isError}>{save.isPending ? "Salvando..." : user ? "Salvar" : "Criar Usuário"}</Button>}
            </DialogFooter>
        </form>
    </DialogContent></Dialog>
}
