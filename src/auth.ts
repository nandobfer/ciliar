import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { dbConnect } from "@/lib/db"
import { accessModels } from "@/features/access/server/models"
import { resolveGoogleAccount } from "@/features/auth/server/google-account"
import { loginErrorPath } from "@/features/auth/login-errors"
import { logger } from "@/lib/logger"
import { appOrigin } from "@/features/auth/server/origin"

const OBJECT_ID = /^[a-f\d]{24}$/i

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
    // Configuração lazy: o build não depende de ambiente/segredos de produção.
    process.env.AUTH_URL ||= appOrigin()
    return {
    secret: process.env.AUTH_SECRET,
    trustHost: true,
    pages: { signIn: "/login", error: "/login" },
    session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
    // Somente Google. Credenciais OAuth no ambiente: o login é pré-requisito para abrir /integracoes.
    providers: [Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
        authorization: { params: { prompt: "select_account" } },
    })],
    callbacks: {
        signIn: async ({ account, profile }) => {
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
        jwt: async ({ token, account }) => {
            await dbConnect()
            if (account) {
                // Primeiro token: troca o `sub` do Google pelo ID do usuário vinculado em `signIn`.
                if (account.provider !== "google" || !account.providerAccountId) return null
                const linked = await accessModels().users.findOne({ googleSub: account.providerAccountId, active: true })
                if (!linked) return null
                token.sub = linked.id as string
                token.sessionVersion = linked.sessionVersion
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
