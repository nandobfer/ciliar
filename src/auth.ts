import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { dbConnect } from "@/lib/db"
import { accessModels } from "@/features/access/server/models"
import { resolveGoogleAccount } from "@/features/auth/server/google-account"
import { loginErrorPath } from "@/features/auth/login-errors"
import { loginSchema } from "@/features/auth/schemas"
import { getDummyHash, verifyPassword } from "@/features/auth/server/password"
import { requestProtocol } from "@/features/auth/request-origin"
import { appOrigin, requestAuthContext } from "@/features/auth/server/origin"
import { logger } from "@/lib/logger"

const OBJECT_ID = /^[a-f\d]{24}$/i

// `AUTH_URL`/`NEXTAUTH_URL` fariam o Auth.js reescrever TODA requisição para uma única origem,
// quebrando o acesso por outro endereço permitido (ex.: http://IP:porta). A origem canônica fica no
// `APP_ORIGIN` (fallback legado no `AUTH_URL`) e a rota do Auth.js entrega a origem de cada requisição.
if (!process.env.APP_ORIGIN && process.env.AUTH_URL) process.env.APP_ORIGIN = process.env.AUTH_URL
delete process.env.AUTH_URL
delete process.env.NEXTAUTH_URL

/** Cabeçalhos da requisição atual (RSC/rotas); fora de uma requisição, vazio. */
async function currentHeaders(): Promise<Headers> {
    try {
        const { headers } = await import("next/headers")
        return new Headers(await headers())
    } catch {
        return new Headers()
    }
}

export const { handlers, auth, signIn, signOut } = NextAuth(async (request) => {
    // Configuração por requisição: cookies `Secure` (e prefixo `__Secure-`) só quando o acesso é HTTPS.
    const requestHeaders = request?.headers ?? (await currentHeaders())
    const secure = requestProtocol(requestHeaders, request?.url ?? appOrigin()) === "https"
    return {
    secret: process.env.AUTH_SECRET,
    trustHost: true,
    useSecureCookies: secure,
    pages: { signIn: "/login", error: "/login" },
    session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
    // Métodos por protocolo (integração Autenticação): a rota `/api/auth/*` recusa o método
    // desabilitado antes do Auth.js; `authorize` confere de novo. Credenciais OAuth no ambiente.
    providers: [
        Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            authorization: { params: { prompt: "select_account" } },
        }),
        Credentials({
            credentials: { identifier: {}, password: {} },
            authorize: async (raw, authRequest) => {
                const parsed = loginSchema.safeParse(raw)
                if (!parsed.success) return null
                const { methods } = await requestAuthContext(authRequest.headers, authRequest.url)
                if (!methods.includes("password")) return null
                await dbConnect()
                const { users } = accessModels()
                const user = await users.findOne({ email: parsed.data.identifier }).select("+passwordHash")
                const valid = await verifyPassword(user?.passwordHash || await getDummyHash(), parsed.data.password)
                if (!valid || !user?.passwordHash || !user.active) return null
                await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } })
                return { id: user.id as string, name: user.name, email: user.email, sessionVersion: user.sessionVersion }
            },
        }),
    ],
    callbacks: {
        signIn: async ({ account, profile }) => {
            if (account?.provider === "credentials") return true
            if (account?.provider !== "google" || !account.providerAccountId) return loginErrorPath("falha")
            try {
                await dbConnect()
                const result = await resolveGoogleAccount({
                    sub: account.providerAccountId,
                    email: typeof profile?.email === "string" ? profile.email : null,
                    emailVerified: profile?.email_verified === true,
                    name: typeof profile?.name === "string" ? profile.name : null,
                })
                if (result.status === "denied") {
                    logger.warn({ action: "auth.denied", code: result.code }, "Login Google recusado")
                    return loginErrorPath(result.code)
                }
                return true
            } catch (error) {
                logger.error({ err: error, action: "auth.google" }, "Falha ao resolver a conta Google")
                return loginErrorPath("falha")
            }
        },
        jwt: async ({ token, account, user }) => {
            await dbConnect()
            if (account) {
                if (account.provider === "credentials") {
                    // `authorize` já validou senha, conta ativa e método; o token guarda o usuário e a versão.
                    const sessionVersion = user && "sessionVersion" in user ? user.sessionVersion : undefined
                    if (!user?.id || typeof sessionVersion !== "number") return null
                    token.sub = user.id
                    token.sessionVersion = sessionVersion
                } else {
                    // Primeiro token Google: troca o `sub` do Google pelo ID do usuário vinculado em `signIn`.
                    if (account.provider !== "google" || !account.providerAccountId) return null
                    const linked = await accessModels().users.findOne({ googleSub: account.providerAccountId, active: true })
                    if (!linked) return null
                    token.sub = linked.id as string
                    token.sessionVersion = linked.sessionVersion
                }
                delete token.picture
            }
            if (!token.sub || typeof token.sessionVersion !== "number" || !OBJECT_ID.test(token.sub)) return null
            const current = await accessModels().users.findOne({ _id: token.sub, active: true, sessionVersion: token.sessionVersion })
            if (!current) return null
            token.name = current.name; token.email = current.email
            return token
        },
        session: async ({ session, token }) => {
            Object.assign(session.user, { id: token.sub, sessionVersion: token.sessionVersion })
            return session
        },
        redirect: ({ url, baseUrl }) => {
            if (url.includes("\\") || /[\r\n]/.test(url)) return baseUrl
            if (url.startsWith("/") && !url.startsWith("//")) return `${baseUrl}${url}`
            try { return new URL(url).origin === baseUrl ? url : baseUrl } catch { return baseUrl }
        },
    },
    events: {
        signIn: async ({ account }) => { logger.info({ action: "auth.login", provider: account?.provider }, "Usuário autenticado") },
        signOut: async message => {
            if ("token" in message && message.token?.sub && typeof message.token.sessionVersion === "number") {
                await dbConnect()
                await accessModels().users.updateOne({ _id: message.token.sub, sessionVersion: message.token.sessionVersion }, { $inc: { sessionVersion: 1 } })
                logger.info({ action: "auth.logout", actorId: message.token.sub }, "Sessões revogadas")
            }
        },
    },
    logger: {
        error: error => {
            const cause = (error as { cause?: { err?: unknown } | unknown }).cause
            const underlying = cause && typeof cause === "object" && "err" in cause ? cause.err : cause
            logger.warn({ action: "auth.error", code: "type" in error ? error.type : error.name, err: underlying instanceof Error ? underlying : error }, "Falha de autenticação")
        },
        warn: code => logger.warn({ action: "auth.warning", code }, "Aviso de autenticação"),
        debug: () => undefined,
    },
    }
})
