import { isMockMode, sendEmail } from "@/lib/email/mailer"
import { withBasePath } from "@/lib/base-path"
import { logger } from "@/lib/logger"
import { appOrigin } from "@/features/auth/server/origin"
import type { InviteResult } from "../types"

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!)

/** Convite por e-mail é opcional: só existe com a integração SMTP configurada (host definido). */
export async function smtpConfigured(): Promise<boolean> {
    return !(await isMockMode())
}

/** Envia o convite depois do commit do cadastro. Falha no envio não desfaz a conta (o admin pode reenviar). */
export async function sendInviteEmail(to: string, name: string): Promise<InviteResult> {
    if (!(await smtpConfigured())) return "smtp-indisponivel"
    const link = `${appOrigin()}${withBasePath("/login")}`
    const html = [
        `<p>Olá, ${escapeHtml(name)}!</p>`,
        "<p>Você foi convidado para o <strong>Ciliar</strong>.</p>",
        `<p>Para entrar, acesse <a href="${escapeHtml(link)}">${escapeHtml(link)}</a> e use <strong>Entrar com Google</strong> com a conta Google deste e-mail (${escapeHtml(to)}) ou, se um administrador definiu uma senha para você, entre com este e-mail e a senha (quando o login por e-mail e senha estiver disponível).</p>`,
        "<p>Se você não esperava este convite, ignore esta mensagem.</p>",
    ].join("")
    try {
        await sendEmail(to, "Convite para o Ciliar", html)
        return "enviado"
    } catch (error) {
        logger.warn({ err: error, module: "access", action: "user.invite" }, "Falha ao enviar o convite por e-mail")
        return "falhou"
    }
}
