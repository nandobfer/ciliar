import { LoginPage } from "@/features/auth/components/LoginPage"
import { loginErrorMessage } from "@/features/auth/login-errors"

export const dynamic = "force-dynamic"

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string; error?: string }> }) {
    const params = await searchParams
    const configured = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET
    const notice = configured ? loginErrorMessage(params.erro, params.error) : "Login com Google não configurado: defina AUTH_GOOGLE_ID e AUTH_GOOGLE_SECRET no ambiente do servidor."
    return <LoginPage nextPath={params.next} notice={notice} disabled={!configured} />
}
