import { Types } from "mongoose"
import { isMockMode, sendEmail } from "@/lib/email/mailer"
import { withBasePath } from "@/lib/base-path"
import { logger } from "@/lib/logger"
import { publishToChannels } from "@/lib/pusher/channels"
import { businessesChannel } from "@/lib/pusher/channel-names"
import { appOrigin } from "@/features/auth/server/origin"
import { accessModels } from "@/features/access/server/models"
import { formatMoney } from "@/features/businesses/format"
import { resolveTheme } from "@/features/businesses/theme"
import { DEFAULT_BUSINESS_THEME } from "@/features/businesses/constants"
import { ORDER_DECIDED_EVENT } from "../constants"

/**
 * Avisos do M3 (SOMENTE servidor): e-mail do orçamento ao cliente, e-mail ao prestador quando o
 * cliente decide (SMTP, se configurado) e o toast em tempo real (só invalidação no canal do dono).
 * Falha no envio nunca desfaz a operação.
 */

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!)
const dateLabel = (key: string) => key.split("-").reverse().join("/")

interface MailBusiness {
    name: string
    theme?: { primaryColor: string; mode: "dark" | "light" } | null
    contactEmail: string | null
    contactPhone: string | null
}

/** Moldura com a cor do negócio (`theme.ts`: cor válida e contraste garantido). */
function frame(business: MailBusiness, body: string): string {
    const theme = resolveTheme(business.theme ?? DEFAULT_BUSINESS_THEME)
    const contact = [business.contactEmail, business.contactPhone].filter(Boolean).map((value) => escapeHtml(value!)).join(" · ")
    return [
        `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">`,
        `<div style="background:${theme.primary};color:${theme.primaryForeground};padding:16px 20px;border-radius:8px 8px 0 0;font-size:18px;font-weight:bold">${escapeHtml(business.name)}</div>`,
        `<div style="border:1px solid #e5e5e5;border-top:0;padding:20px;border-radius:0 0 8px 8px">${body}`,
        contact ? `<p style="color:#666;font-size:12px;margin-top:24px">${contact}</p>` : "",
        "</div></div>",
    ].join("")
}

export type QuoteEmailResult = "sent" | "smtp-unavailable" | "failed"

export async function sendQuoteEmail(input: { to: string; clientName: string; business: MailBusiness; code: string; title: string; url: string; validUntil: string; totalCents: number; currency: string }): Promise<QuoteEmailResult> {
    if (await isMockMode()) return "smtp-unavailable"
    const theme = resolveTheme(input.business.theme ?? DEFAULT_BUSINESS_THEME)
    const body = [
        `<p>Olá, ${escapeHtml(input.clientName)}!</p>`,
        `<p>Segue o orçamento <strong>${escapeHtml(input.code)}</strong> — ${escapeHtml(input.title)}.</p>`,
        `<p>Valor total: <strong>${escapeHtml(formatMoney(input.totalCents, input.currency))}</strong><br/>Válido até ${dateLabel(input.validUntil)}.</p>`,
        `<p><a href="${escapeHtml(input.url)}" style="display:inline-block;background:${theme.primary};color:${theme.primaryForeground};padding:10px 16px;border-radius:6px;text-decoration:none">Ver orçamento</a></p>`,
        `<p style="color:#666;font-size:12px">Pelo link você pode aceitar ou recusar o orçamento. Não compartilhe este link.</p>`,
    ].join("")
    try {
        await sendEmail(input.to, `Orçamento ${input.code} — ${input.business.name}`, frame(input.business, body))
        return "sent"
    } catch (error) {
        logger.warn({ err: error, module: "orders", action: "order.email" }, "Falha ao enviar o orçamento por e-mail")
        return "failed"
    }
}

/** Toast em tempo real (só invalidação) e e-mail ao prestador quando o cliente decide pelo link. */
export async function notifyClientDecision(input: { ownerId: string; businessId: string; orderId: string; kind: "accept" | "reject"; code: string; business: MailBusiness; deciderName: string | null; reason: string | null }): Promise<void> {
    await publishToChannels([businessesChannel(input.ownerId)], ORDER_DECIDED_EVENT, { businessId: input.businessId, orderId: input.orderId }).catch(() => undefined)
    if (await isMockMode()) return
    if (!Types.ObjectId.isValid(input.ownerId)) return
    const owner = await accessModels().users.findById(input.ownerId).select({ email: 1, name: 1 }).lean<{ email?: string; name?: string }>()
    if (!owner?.email) return
    const accepted = input.kind === "accept"
    const link = `${appOrigin()}${withBasePath(`/negocios/${input.businessId}/pedidos/${input.orderId}`)}`
    const body = [
        `<p>Olá, ${escapeHtml(owner.name ?? "")}!</p>`,
        `<p>O cliente <strong>${accepted ? "aceitou" : "recusou"}</strong> o orçamento <strong>${escapeHtml(input.code)}</strong>${input.deciderName ? ` (por ${escapeHtml(input.deciderName)})` : ""}.</p>`,
        input.reason ? `<p>Motivo: ${escapeHtml(input.reason)}</p>` : "",
        accepted ? "<p>O trabalho foi criado na coluna Abertura.</p>" : "",
        `<p><a href="${escapeHtml(link)}">Abrir o pedido</a></p>`,
    ].join("")
    try {
        await sendEmail(owner.email, `Orçamento ${input.code} ${accepted ? "aceito" : "recusado"} pelo cliente`, frame(input.business, body))
    } catch (error) {
        logger.warn({ err: error, module: "orders", action: "order.decision.email" }, "Falha ao avisar o prestador por e-mail")
    }
}
