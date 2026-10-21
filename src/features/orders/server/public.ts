import mongoose from "mongoose"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { todayKeyIn } from "@/lib/timezone"
import { getFileObject, storageErrorInfo } from "@/lib/storage/s3"
import { accessModels } from "@/features/access/server/models"
import { parseInput } from "@/features/access/server/commands"
import { ensureBusinessCollections } from "@/features/businesses/server/access"
import { businessModels } from "@/features/businesses/server/models"
import { publishSpaceChanged } from "@/features/businesses/server/businesses"
import { DEFAULT_BUSINESS_THEME } from "@/features/businesses/constants"
import type { BusinessDoc } from "@/features/businesses/server/items"
import { diffOrderSnapshots, itemSubtotalCents, quoteExpired } from "../logic"
import { quoteAcceptSchema, quoteRejectSchema } from "../schemas"
import type { PublicQuoteDto } from "../types"
import { orderModels } from "./models"
import { snapshotOf, type OrderDoc, type OrderVersionDoc } from "./order-dto"
import { hashQuoteToken, isQuoteTokenShape, quoteTokenMatches } from "./link"
import { publishClientsChanged } from "./clients"
import { applyDecision, ownerAccountEmail } from "./orders"
import { notifyClientDecision } from "./notify"

/**
 * Link do orçamento (cliente, SEM login) — SOMENTE servidor. Autoriza somente pelo token secreto,
 * restrito àquele pedido: o cliente vê a versão atual, os anexos visíveis e o histórico das versões
 * enviadas; nunca as observações do cliente nem dados internos. Limite de taxa na rota.
 */

const notFound = () => new DomainError(404, "Link inválido, revogado ou cancelado.", "QUOTE_NOT_FOUND")
export const quoteBasePath = (token: string) => `/api/public/orders/${token}`

async function loadByToken(token: string): Promise<{ order: OrderDoc; business: BusinessDoc }> {
    if (!isQuoteTokenShape(token)) throw notFound()
    await dbConnect()
    const order = await orderModels().orders.findOne({ "link.tokenHash": hashQuoteToken(token) }).lean<OrderDoc>()
    if (!order?.link || !quoteTokenMatches(token, order.link.tokenBox)) throw notFound()
    const business = await businessModels().businesses.findById(order.businessId).lean<BusinessDoc>()
    if (!business) throw notFound()
    return { order, business }
}

function stateOf(order: OrderDoc, business: BusinessDoc, now: Date): PublicQuoteDto["state"] {
    if (business.status !== "active") return "unavailable"
    if (order.status === "accepted") return "accepted"
    if (order.status === "rejected") return "rejected"
    if (order.status !== "sent") return "unavailable"
    return quoteExpired(order.link!.validUntil, todayKeyIn(order.link!.timeZone, now)) ? "expired" : "open"
}

export async function getPublicQuote(token: string, now: Date = new Date()): Promise<PublicQuoteDto> {
    const { order, business } = await loadByToken(token)
    const state = stateOf(order, business, now)
    const base = quoteBasePath(token)
    const businessInfo = {
        name: business.name,
        description: business.description ?? null,
        links: business.links ?? [],
        logoUrl: business.logo ? `${base}/logo?v=${encodeURIComponent(business.logo.key.split("/").slice(-2).join("-"))}` : null,
        contactEmail: business.contactEmail ?? (await ownerAccountEmail(business.ownerId)),
        contactPhone: business.contactPhone ?? null,
        theme: { primaryColor: business.theme?.primaryColor ?? DEFAULT_BUSINESS_THEME.primaryColor, mode: business.theme?.mode === "light" ? ("light" as const) : ("dark" as const) },
    }
    // Negócio arquivado: só "indisponível" (sem dados do pedido).
    if (state === "unavailable") {
        return { state, code: order.code, business: businessInfo, title: "", description: "", currency: order.currency, items: [], totalCents: 0, dueDate: null, validUntil: order.link!.validUntil, attachments: [], history: [], decision: null }
    }
    const decided = state === "accepted" || state === "rejected" ? (order.decisions ?? []).at(-1) : null
    // Depois da decisão, o link mostra a versão decidida (cópia imutável).
    const snapshot = decided?.snapshot ?? snapshotOf(order)
    const versions = await orderModels().orderVersions.find({ orderId: order._id.toString(), published: true }).sort({ number: 1 }).lean<OrderVersionDoc[]>()
    const history = versions.map((version, index) => ({ number: version.number, reason: version.reason, at: new Date(version.createdAt).toISOString(), changes: diffOrderSnapshots(index ? versions[index - 1]!.snapshot : null, version.snapshot) })).reverse()
    const visible = new Set(snapshot.attachments.map((file) => file.id))
    return {
        state,
        code: order.code,
        business: businessInfo,
        title: snapshot.title,
        description: snapshot.description,
        currency: snapshot.currency,
        items: snapshot.items.map((item) => ({ ...item, subtotalCents: itemSubtotalCents(item.minutes, item.hourlyRateCents) })),
        totalCents: snapshot.totalCents,
        dueDate: snapshot.dueDate,
        validUntil: order.link!.validUntil,
        attachments: (order.attachments ?? []).filter((file) => visible.has(file.id) && file.clientVisible !== false).map((file) => ({ id: file.id, name: file.name, mediaType: file.mediaType, size: file.size, url: `${base}/files/${file.id}` })),
        history,
        decision: decided ? { kind: decided.kind, name: decided.name ?? null, reason: decided.reason ?? null, at: new Date(decided.at).toISOString() } : null,
    }
}

/** Aceite (nome obrigatório) ou recusa (motivo opcional) pelo cliente: data/hora, IP e a cópia da versão. */
export async function decideQuote(token: string, kind: "accept" | "reject", raw: unknown, ip: string | null, now: Date = new Date()): Promise<PublicQuoteDto> {
    const input = kind === "accept" ? parseInput(quoteAcceptSchema, raw) : parseInput(quoteRejectSchema, raw)
    const name = input.name?.trim() || null
    const reason = "reason" in input ? input.reason?.trim() || null : null
    const { order } = await loadByToken(token)
    await ensureBusinessCollections()
    let business: BusinessDoc | null = null
    await mongoose.connection.transaction(
        async (session) => {
            // Compartilha o fence das alterações do dono (arquivar/purgar o negócio inclusive).
            await businessModels().ownerStates.updateOne({ _id: order.ownerId }, { $inc: { fence: 1 } }, { session, upsert: true })
            const fresh = await orderModels().orders.findById(order._id).session(session).lean<OrderDoc>()
            business = await businessModels().businesses.findById(order.businessId).session(session).lean<BusinessDoc>()
            if (!fresh?.link || fresh.link.tokenHash !== order.link!.tokenHash || !business) throw notFound()
            const state = stateOf(fresh, business, now)
            if (state === "expired") throw new DomainError(409, "Este orçamento expirou. Peça ao prestador um novo link.", "QUOTE_EXPIRED")
            if (state === "unavailable") throw new DomainError(409, "Este orçamento está indisponível no momento.", "QUOTE_UNAVAILABLE")
            if (state !== "open") throw new DomainError(409, "Este orçamento já foi decidido.", "ORDER_ALREADY_DECIDED")
            await applyDecision(session, fresh, { kind, by: "client", actorId: null, name, reason, ip }, async (action, before, after) => {
                await accessModels().audits.create([{ actorId: "client:link", action, targetId: fresh._id.toString(), before, after }], { session })
            })
        },
        { readPreference: "primary", writeConcern: { w: "majority" }, maxCommitTimeMS: 10000 },
    )
    const decided = business as BusinessDoc | null
    await publishSpaceChanged(order.ownerId, order.businessId, "orders")
    await publishClientsChanged(order.ownerId, order.clientId)
    if (decided) {
        await notifyClientDecision({
            ownerId: order.ownerId,
            businessId: order.businessId,
            orderId: order._id.toString(),
            kind,
            code: order.code,
            business: { name: decided.name, theme: decided.theme, contactEmail: decided.contactEmail ?? null, contactPhone: decided.contactPhone ?? null },
            deciderName: name,
            reason,
        })
    }
    return getPublicQuote(token, now)
}

async function streamObject(key: string, mediaType: string, name: string, inline: boolean): Promise<Response> {
    let file
    try {
        file = await getFileObject(key)
    } catch (error) {
        if (storageErrorInfo(error).kind === "not_found") throw new DomainError(404, "Arquivo não encontrado", "QUOTE_FILE_NOT_FOUND")
        throw new DomainError(502, "Não foi possível carregar o arquivo. Tente novamente em instantes.", "STORAGE_UNAVAILABLE")
    }
    const headers: Record<string, string> = {
        "Content-Type": mediaType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
    }
    if (file.contentLength != null) headers["Content-Length"] = String(file.contentLength)
    return new Response(file.body, { status: 200, headers })
}

/** Anexo visível ao cliente (somente com o link válido; negócio arquivado: indisponível). */
export async function publicQuoteFile(token: string, fileId: string, options: { download?: boolean } = {}): Promise<Response> {
    const { order, business } = await loadByToken(token)
    if (stateOf(order, business, new Date()) === "unavailable") throw notFound()
    const attachment = (order.attachments ?? []).find((file) => file.id === fileId && file.clientVisible !== false)
    if (!attachment) throw new DomainError(404, "Arquivo não encontrado", "QUOTE_FILE_NOT_FOUND")
    const doc = await businessModels().files.findOne({ _id: fileId, businessId: order.businessId, ready: true }).lean()
    if (!doc) throw new DomainError(404, "Arquivo não encontrado", "QUOTE_FILE_NOT_FOUND")
    const inline = !options.download && doc.mediaType !== "image/svg+xml" && (doc.mediaType.startsWith("image/") || doc.mediaType === "application/pdf" || doc.mediaType.startsWith("text/"))
    return streamObject(doc.key, doc.mediaType, doc.name, inline)
}

export async function publicQuoteLogo(token: string): Promise<Response> {
    const { business } = await loadByToken(token)
    if (!business.logo) throw new DomainError(404, "O negócio não tem logo", "BUSINESS_LOGO_NOT_FOUND")
    return streamObject(business.logo.key, business.logo.mediaType, business.logo.name, true)
}
