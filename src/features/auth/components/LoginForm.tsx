"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { useForm, type UseFormRegisterReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { apiErrorMessage } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { HOME_HREF } from "@/features/layout/navigation"
import type { AuthMethod } from "@/features/authentication/constants"
import { LOGIN_ERROR_MESSAGES } from "../login-errors"
import { loginSchema, passwordSignupSchema, type LoginInput } from "../schemas"
import { useLogin, usePasswordSignup, useResetTabState } from "../hooks/useLogin"

/** Só aceita destino relativo do app (sem esquema nem `//`), evitando open redirect. */
function safeNext(value: string | undefined): string | null {
    if (!value) return null
    if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) return null
    return value
}

/** Marca do Google (cores oficiais), sem dependência externa. */
function GoogleMark() {
    return (
        <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
    )
}

/** Campo de senha com mostrar/ocultar (do login da base do Opex). */
function PasswordInput({ id, autoComplete, disabled, invalid, register }: { id: string; autoComplete: string; disabled: boolean; invalid: boolean; register: UseFormRegisterReturn }) {
    const [revealed, setRevealed] = useState(false)
    return (
        <div className="relative">
            <Input id={id} type={revealed ? "text" : "password"} autoComplete={autoComplete} disabled={disabled} aria-invalid={invalid ? true : undefined} className="pr-10" {...register} />
            <button
                type="button"
                onClick={() => setRevealed((value) => !value)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                aria-label={revealed ? "Ocultar senha" : "Mostrar senha"}
                title={revealed ? "Ocultar senha" : "Mostrar senha"}
            >
                {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
        </div>
    )
}

function PasswordLoginForm({ onDone }: { onDone: () => void }) {
    const login = useLogin()
    const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { identifier: "", password: "" }, mode: "onTouched" })
    const identifierError = form.formState.errors.identifier?.message
    const passwordError = form.formState.errors.password?.message
    const onSubmit = form.handleSubmit((values) => {
        login.mutate(values, {
            onSuccess: onDone,
            onError: (error) => {
                const message = error instanceof Error ? error.message : "Não foi possível entrar. Tente novamente."
                form.setError("password", { message })
                toast.error(message)
            },
        })
    })
    return (
        <form onSubmit={onSubmit} className="space-y-4" noValidate aria-label="Entrar com e-mail e senha">
            <Field id="login-identifier" label="E-mail" error={identifierError}>
                <Input id="login-identifier" type="email" autoComplete="username" autoFocus disabled={login.isPending} aria-invalid={identifierError ? true : undefined} {...form.register("identifier")} />
            </Field>
            <Field id="login-password" label="Senha" error={passwordError}>
                <PasswordInput id="login-password" autoComplete="current-password" disabled={login.isPending} invalid={!!passwordError} register={form.register("password")} />
            </Field>
            <Button type="submit" className="w-full" disabled={login.isPending}>
                {login.isPending ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Entrando…
                    </>
                ) : (
                    "Entrar"
                )}
            </Button>
        </form>
    )
}

const signupFormSchema = passwordSignupSchema.extend({ confirmacao: z.string() }).refine((data) => data.password === data.confirmacao, { path: ["confirmacao"], message: "As senhas não coincidem" })
type SignupValues = z.infer<typeof signupFormSchema>

function PasswordSignupForm({ onDone }: { onDone: () => void }) {
    const signup = usePasswordSignup()
    const form = useForm<SignupValues>({ resolver: zodResolver(signupFormSchema), defaultValues: { nome: "", email: "", password: "", confirmacao: "" }, mode: "onTouched" })
    const { errors } = form.formState
    const onSubmit = form.handleSubmit((values) => {
        signup.mutate({ nome: values.nome, email: values.email, password: values.password }, {
            onSuccess: onDone,
            onError: (error) => {
                const message = apiErrorMessage(error, error instanceof Error ? error.message : "Não foi possível criar a conta. Tente novamente.")
                form.setError("email", { message })
                toast.error(message)
            },
        })
    })
    return (
        <form onSubmit={onSubmit} className="space-y-4" noValidate aria-label="Criar conta com e-mail e senha">
            <Field id="signup-name" label="Nome" error={errors.nome?.message}>
                <Input id="signup-name" autoComplete="name" autoFocus disabled={signup.isPending} aria-invalid={errors.nome ? true : undefined} {...form.register("nome")} />
            </Field>
            <Field id="signup-email" label="E-mail" error={errors.email?.message}>
                <Input id="signup-email" type="email" autoComplete="email" disabled={signup.isPending} aria-invalid={errors.email ? true : undefined} {...form.register("email")} />
            </Field>
            <Field id="signup-password" label="Senha (12 a 128 caracteres)" error={errors.password?.message}>
                <PasswordInput id="signup-password" autoComplete="new-password" disabled={signup.isPending} invalid={!!errors.password} register={form.register("password")} />
            </Field>
            <Field id="signup-confirm" label="Confirme a senha" error={errors.confirmacao?.message}>
                <Input id="signup-confirm" type="password" autoComplete="new-password" disabled={signup.isPending} aria-invalid={errors.confirmacao ? true : undefined} {...form.register("confirmacao")} />
            </Field>
            <Button type="submit" className="w-full" disabled={signup.isPending}>
                {signup.isPending ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Criando conta…
                    </>
                ) : (
                    "Criar conta"
                )}
            </Button>
        </form>
    )
}

export interface LoginFormProps {
    nextPath?: string
    /** Métodos habilitados para o protocolo de acesso (integração Autenticação). */
    methods?: readonly AuthMethod[]
    /** Google habilitado, mas sem credenciais OAuth no ambiente. */
    disabled?: boolean
    /** Cadastro público disponível (perfil padrão + termos publicados): mostra "Criar conta" com senha. */
    signupAvailable?: boolean
}

/**
 * Cartão de entrada: e-mail e senha (com "Criar conta") só quando o método está habilitado para o
 * protocolo de acesso, e "Entrar com Google" só quando o Google está habilitado.
 */
export function LoginForm({ nextPath, methods = ["google"], disabled = false, signupAvailable = false }: LoginFormProps) {
    const router = useRouter()
    const reset = useResetTabState()
    const [pending, setPending] = useState(false)
    const [mode, setMode] = useState<"login" | "signup">("login")
    const password = methods.includes("password")
    const google = methods.includes("google")
    const destination = safeNext(nextPath) ?? HOME_HREF

    const enter = () => {
        router.replace(destination)
        router.refresh()
    }

    const startGoogle = async () => {
        setPending(true)
        reset()
        try {
            await signIn("google", { redirectTo: destination })
        } catch {
            setPending(false)
            toast.error(LOGIN_ERROR_MESSAGES.falha)
        }
    }

    return (
        <div className="space-y-4">
            {password && (mode === "signup" && signupAvailable ? <PasswordSignupForm onDone={enter} /> : <PasswordLoginForm onDone={enter} />)}
            {password && signupAvailable && (
                <p className="text-center text-xs text-muted-foreground">
                    {mode === "login" ? "Ainda não tem conta? " : "Já tem conta? "}
                    <button type="button" className="text-primary underline underline-offset-2 hover:text-primary/80" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
                        {mode === "login" ? "Criar conta" : "Entrar"}
                    </button>
                </p>
            )}
            {password && google && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
                    <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
                </div>
            )}
            {google && (
                <Button type="button" variant="outline" className="w-full gap-2" disabled={disabled || pending} onClick={() => void startGoogle()}>
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />}
                    {pending ? "Redirecionando…" : "Entrar com Google"}
                </Button>
            )}
            {(google || signupAvailable) && (
                <p className="text-center text-xs text-muted-foreground">
                    Novo por aqui? {google ? "Com o Google, a conta é criada no primeiro acesso. " : ""}Ao continuar, você deverá aceitar os{" "}
                    <Link href="/termos" className="text-primary underline underline-offset-2 hover:text-primary/80">termos de uso</Link> e a{" "}
                    <Link href="/privacidade" className="text-primary underline underline-offset-2 hover:text-primary/80">política de privacidade</Link>.
                </p>
            )}
        </div>
    )
}
