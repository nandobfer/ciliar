import { useEffect, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Mail } from "lucide-react"
import { Can } from "@nandobfer/perfix/react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/ui/field"
import { Checkbox } from "@/components/ui/checkbox"
import { createUserSchema, updateUserSchema } from "../schemas"
import { useAccessMutation, useAssignableRoles, useInviteStatus, useResendInvite } from "../hooks/useAccessAdmin"
import { useAppSession } from "./AccessProvider"
import { UserPasswordSection } from "./UserPasswordSection"
import type { InviteResult, UserDto } from "../types"

// Senha inicial opcional (cadastro): vazia = sem senha; com valor, sem tamanho mínimo (teto técnico de 128) e igual à confirmação.
const formSchema = createUserSchema.extend({ password: z.string(), confirmacao: z.string() }).superRefine((data, context) => {
    if (data.password.length > 128) context.addIssue({ code: "custom", path: ["password"], message: "Use no máximo 128 caracteres" })
    if (data.password !== data.confirmacao) context.addIssue({ code: "custom", path: ["confirmacao"], message: "As senhas não coincidem" })
})
type Values = z.infer<typeof formSchema>
const INVITE_WARNINGS: Partial<Record<InviteResult, string>> = {
    falhou: "Usuário cadastrado, mas o e-mail de convite não foi enviado. Reenvie pela edição do usuário.",
    "smtp-indisponivel": "Usuário cadastrado sem e-mail de convite: o SMTP não está configurado.",
}
export function UserEditor({ user, onClose }: { user?: UserDto; onClose: () => void }) {
    const { session } = useAppSession()
    const self = user?.id === session?.user.id
    const [tab, setTab] = useState("geral")
    const roles = useAssignableRoles(true)
    const invite = useInviteStatus(!user)
    const resend = useResendInvite()
    const save = useAccessMutation()
    const form = useForm<Values>({ resolver: zodResolver(formSchema), defaultValues: { nome: user?.nome ?? "", email: user?.email ?? "", ativo: user?.ativo ?? true, cargos: user?.roleIds ?? [], enviarConvite: undefined, password: "", confirmacao: "" } })
    const { errors, isDirty } = form.formState
    const smtp = invite.data?.smtpConfigured === true
    useEffect(() => {
        const handler = (event: BeforeUnloadEvent) => { if (isDirty) { event.preventDefault(); event.returnValue = "" } }
        window.addEventListener("beforeunload", handler)
        return () => window.removeEventListener("beforeunload", handler)
    }, [isDirty])
    const close = () => { if (!save.isPending && (!isDirty || window.confirm("Descartar as alterações do usuário?"))) onClose() }
    const submit = form.handleSubmit(async values => {
        const raw = user ? { nome: values.nome, ativo: values.ativo, cargos: values.cargos, version: user.version } : { nome: values.nome, email: values.email, ativo: values.ativo, cargos: values.cargos, enviarConvite: smtp && (values.enviarConvite ?? true), ...(values.password ? { password: values.password } : {}) }
        const parsed = user ? updateUserSchema.safeParse(raw) : createUserSchema.safeParse(raw)
        if (!parsed.success) {
            const issue = parsed.error.issues[0]!
            form.setError(issue.path[0] as keyof Values, { message: issue.message }); setTab(issue.path[0] === "cargos" ? "perfis" : "geral"); return
        }
        try {
            const result = await save.mutateAsync({ path: user ? `/users/${user.id}` : "/users", method: user ? "patch" : "post", data: parsed.data }) as { data?: { convite?: InviteResult } }
            const warning = result.data?.convite ? INVITE_WARNINGS[result.data.convite] : undefined
            if (warning && (raw as { enviarConvite?: boolean }).enviarConvite) toast.warning(warning)
            form.reset(); onClose()
        } catch { /* conserva o rascunho */ }
    }, errors => setTab(errors.cargos && !errors.nome && !errors.email && !errors.password && !errors.confirmacao ? "perfis" : "geral"))
    const selected = useWatch({ control: form.control, name: "cargos" })
    const active = useWatch({ control: form.control, name: "ativo" })
    // Sem escolha explícita, o convite por e-mail segue o SMTP: marcado quando configurado.
    const sendInvite = useWatch({ control: form.control, name: "enviarConvite" }) ?? smtp
    // Mantém referências inativas/bloqueadas existentes; a API valida somente o delta.
    const options = [...roles.data ?? [], ...user?.cargos.filter(role => !roles.data?.some(option => option.id === role.id)).map(role => ({ ...role, bloqueado: true, motivo: "Perfil indisponível para novas atribuições" })) ?? []]
    return <Dialog open onOpenChange={open => { if (!open) close() }}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{user ? "Editar Usuário" : "Novo Usuário"}</DialogTitle><DialogDescription>{user ? "Dados e atribuições de acesso" : "Pré-cadastro: a pessoa entra com o Google usando este e-mail ou com a senha inicial (opcional) e recebe os perfis escolhidos."}</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-5" noValidate>
            <Tabs value={tab} onValueChange={setTab}><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="geral">Geral</TabsTrigger><TabsTrigger value="perfis">Perfis</TabsTrigger></TabsList>
                <TabsContent value="geral" className="space-y-4 pt-4">
                    <Field id="user-name" label="Nome" error={errors.nome?.message}><Input id="user-name" autoComplete="name" {...form.register("nome")} disabled={save.isPending} /></Field>
                    <Field id="user-email" label="E-mail" error={errors.email?.message}><Input id="user-email" type="email" autoComplete="email" {...form.register("email")} disabled={!!user || save.isPending} /></Field>
                    <label className="flex items-center gap-2 text-sm"><Checkbox checked={active} onCheckedChange={checked => form.setValue("ativo", checked === true, { shouldDirty: true })} disabled={self || save.isPending} />Usuário ativo</label>
                    {!user && <>
                        <Field id="user-password" label="Senha inicial (opcional)" error={errors.password?.message}><Input id="user-password" type="password" autoComplete="new-password" {...form.register("password")} disabled={save.isPending} /></Field>
                        <Field id="user-confirm" label="Confirme a senha" error={errors.confirmacao?.message}><Input id="user-confirm" type="password" autoComplete="new-password" {...form.register("confirmacao")} disabled={save.isPending} /></Field>
                        <p className="text-xs text-muted-foreground">A senha vale quando o login por e-mail e senha estiver habilitado em Integrações › Autenticação. Nunca é enviada no convite.</p>
                    </>}
                    {!user && <div className="space-y-1">
                        <label className="flex items-center gap-2 text-sm"><Checkbox checked={smtp && sendInvite} onCheckedChange={checked => form.setValue("enviarConvite", checked === true, { shouldDirty: true })} disabled={!smtp || !active || save.isPending} />Enviar convite por e-mail</label>
                        {invite.isSuccess && !smtp && <p className="text-xs text-muted-foreground">Configure o SMTP em Integrações para enviar convites por e-mail.</p>}
                    </div>}
                    {user && <UserPasswordSection user={user} self={self} />}
                    {user?.convitePendente && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                        <span><span className="font-medium">Convite pendente</span><span className="block text-xs text-muted-foreground">Esta pessoa ainda não entrou com o Google e não tem senha.</span></span>
                        <Can permission="users.create"><Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={!user.ativo || resend.isPending} onClick={() => resend.mutate(user.id)}><Mail className="h-4 w-4" aria-hidden />Reenviar convite</Button></Can>
                    </div>}
                </TabsContent>
                <TabsContent value="perfis" className="space-y-3 pt-4">
                    {roles.isPending && <p>Carregando perfis...</p>}{roles.isError && <p role="alert">Não foi possível carregar os perfis. <button type="button" onClick={() => void roles.refetch()}>Tentar novamente</button></p>}
                    {options.map(role => <label key={role.id} className="flex items-start gap-3 rounded-lg border p-3 text-sm"><Checkbox checked={selected.includes(role.id)} disabled={self || role.bloqueado || save.isPending} onCheckedChange={checked => form.setValue("cargos", checked ? [...selected, role.id] : selected.filter(id => id !== role.id), { shouldDirty: true })} /><span><span className="font-medium">{role.nome}</span><span className="block text-xs text-muted-foreground">{role.motivo ?? role.descricao}</span></span></label>)}
                    {errors.cargos && <p role="alert" className="text-sm text-destructive">{errors.cargos.message}</p>}
                    {self && <p className="text-sm text-muted-foreground">Não é permitido alterar seus próprios perfis.</p>}
                </TabsContent>
            </Tabs>
            <DialogFooter><Button type="button" variant="outline" disabled={save.isPending} onClick={close}>Cancelar</Button>
                {tab === "geral" && !user ? <Button key="advance" type="button" onClick={() => { void form.trigger(["nome", "email", "password", "confirmacao"]).then(ok => { if (ok) setTab("perfis") }) }}>Definir Perfis</Button> : <Button key="save" type="submit" disabled={save.isPending || roles.isPending || roles.isError}>{save.isPending ? "Salvando..." : user ? "Salvar" : "Criar Usuário"}</Button>}
            </DialogFooter>
        </form>
    </DialogContent></Dialog>
}
