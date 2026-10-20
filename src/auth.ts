import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { dbConnect } from "@/lib/db"
import { accessModels } from "@/features/access/server/models"
import { loginSchema } from "@/features/auth/schemas"
import { getDummyHash, verifyPassword } from "@/features/auth/server/password"
import { checkRateLimit } from "@/features/auth/server/rate-limit"
import { logger } from "@/lib/logger"
import { appOrigin } from "@/features/auth/server/origin"

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
    // Configuração lazy: o build não depende de ambiente/segredos de produção.
    process.env.AUTH_URL ||= appOrigin()
    return {
    secret: process.env.AUTH_SECRET,
    trustHost: true,
    pages: { signIn: "/login", error: "/login" },
    session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
    providers: [Credentials({
        credentials: { identifier: {}, password: {} },
        authorize: async (raw) => {
            const parsed = loginSchema.safeParse(raw)
            if (!parsed.success) return null
            checkRateLimit(`login:${parsed.data.identifier}`)
            await dbConnect()
            const user = await accessModels().users.findOne({ email: parsed.data.identifier }).select("+passwordHash")
            const valid = await verifyPassword(user?.passwordHash ?? await getDummyHash(), parsed.data.password)
            if (!valid || !user?.active) return null
            return { id: user.id as string, name: user.name, email: user.email, sessionVersion: user.sessionVersion }
        },
    })],
    callbacks: {
        jwt: async ({ token, user }) => {
            if (user) { token.sub = user.id; token.sessionVersion = "sessionVersion" in user ? user.sessionVersion : undefined }
            if (!token.sub || typeof token.sessionVersion !== "number" || !/^[a-f\d]{24}$/i.test(token.sub)) return null
            await dbConnect()
            const current = await accessModels().users.findOne({ _id: token.sub, active: true, sessionVersion: token.sessionVersion })
            if (!current) return null
            token.name = current.name; token.email = current.email; token.mustChangePassword = current.mustChangePassword
            return token
        },
        session: async ({ session, token }) => {
            Object.assign(session.user, { id: token.sub, mustChangePassword: token.mustChangePassword === true, sessionVersion: token.sessionVersion })
            return session
        },
        redirect: ({ url, baseUrl }) => {
            if (url.includes("\\") || /[\r\n]/.test(url)) return baseUrl
            if (url.startsWith("/") && !url.startsWith("//")) return `${baseUrl}${url}`
            try { return new URL(url).origin === baseUrl ? url : baseUrl } catch { return baseUrl }
        },
    },
    events: {
        signIn: async ({ user }) => { logger.info({ action: "auth.login", actorId: user.id }, "Usuário autenticado") },
        signOut: async message => {
            if ("token" in message && message.token?.sub && typeof message.token.sessionVersion === "number") {
                await dbConnect()
                await accessModels().users.updateOne({ _id: message.token.sub, sessionVersion: message.token.sessionVersion }, { $inc: { sessionVersion: 1 } })
                logger.info({ action: "auth.logout", actorId: message.token.sub }, "Sessões revogadas")
            }
        },
    },
    logger: {
        error: error => logger.warn({ action: "auth.error", code: "type" in error ? error.type : error.name }, "Falha de autenticação"),
        warn: code => logger.warn({ action: "auth.warning", code }, "Aviso de autenticação"),
        debug: () => undefined,
    },
    }
})
