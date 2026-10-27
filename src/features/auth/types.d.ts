import "next-auth"
declare module "next-auth" {
    interface Session { user: { id: string; name?: string | null; email?: string | null; image?: string | null; sessionVersion: number } }
    /** Login por e-mail e senha: `authorize` devolve a versão da sessão para o primeiro token. */
    interface User { sessionVersion?: number }
}
