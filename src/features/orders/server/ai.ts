import { createHash } from "node:crypto"
import { z } from "zod"
import mongoose from "mongoose"
import { dbConnect } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import { streamAi, type AiStreamEvent } from "@/lib/ai/stream"
import { getAiProvider } from "@/lib/ai/providers"
import { assertCatalog, availability, loadFeature, persistFeature } from "@/features/ai/server/settings"
import type { AiFeatureAvailability } from "@/features/ai/types"
import { publishSpaceChanged } from "@/features/businesses/server/businesses"
import { businessModels } from "@/features/businesses/server/models"
import { ORDER_SUMMARY_MAX, ORDER_TITLE_CONSUMPTION_ORIGIN, ORDER_TITLE_FEATURE, ORDER_TITLE_MAX } from "../constants"
import { DEFAULT_ORDER_TITLE_FEATURE, orderTitleFeatureSchema, type OrderTitleFeatureSettings } from "../schemas"
import type { OrderTitleFeatureDto } from "../types"
import { orderModels } from "./models"
import { snapshotOf, type OrderDoc } from "./order-dto"

/**
 * Agente de título e resumo do pedido (SOMENTE servidor), no padrão dos serviços do Opex: roda em
 * segundo plano ao criar/alterar a descrição e nunca bloqueia o formulário. Desligado: nada muda
 * (o título exibido é a primeira linha da descrição). Ligado e indisponível ou com falha: status
 * de erro com "Gerar novamente". O manual prevalece; a saída nunca sobrescreve uma descrição mais
 * recente que a que a gerou (hash da origem). Consumo com a origem `order-title`.
 */

const log = loggerFor({ module: "orders", feature: "ai" })

export function loadOrderTitleSettings() {
    return loadFeature<OrderTitleFeatureSettings>(ORDER_TITLE_FEATURE, orderTitleFeatureSchema, DEFAULT_ORDER_TITLE_FEATURE)
}

export function orderTitleAvailability(settings: OrderTitleFeatureSettings): Promise<AiFeatureAvailability> {
    return availability({ enabled: settings.enabled, provider: settings.main.provider, model: settings.main.model }, 'O "Título de pedidos"')
}

export async function getOrderTitleSettings(): Promise<OrderTitleFeatureDto> {
    const { settings, isDefault, updatedAt } = await loadOrderTitleSettings()
    return { settings, isDefault, availability: await orderTitleAvailability(settings), updatedAt: updatedAt ? updatedAt.toISOString() : null }
}

export async function saveOrderTitleSettings(input: OrderTitleFeatureSettings, actorId: string): Promise<OrderTitleFeatureDto> {
    const supportsSampling = input.main.provider ? getAiProvider(input.main.provider).supportsSampling : false
    const next: OrderTitleFeatureSettings = {
        ...input,
        main: { ...input.main, variant: input.main.variant || null, temperature: supportsSampling ? input.main.temperature : null, maxOutputTokens: supportsSampling ? input.main.maxOutputTokens : null },
    }
    await assertCatalog({ enabled: next.enabled, provider: next.main.provider, model: next.main.model, variant: next.main.variant, agent: null, temperature: null, maxOutputTokens: null })
    const before = await loadOrderTitleSettings()
    await persistFeature(ORDER_TITLE_FEATURE, next, actorId, before)
    return getOrderTitleSettings()
}

export const orderSourceHash = (description: string) => createHash("sha256").update(description.trim()).digest("hex")

/** Instruções de sistema: prompt configurado + contrato JSON. */
export function buildOrderTitleInstructions(instructions: string): string {
    return [
        instructions.trim(),
        "",
        "Responda APENAS com um objeto JSON válido, sem texto antes ou depois e sem cercas de código, com exatamente estas chaves:",
        `- "title": título curto do pedido, em português do Brasil (no máximo ${ORDER_TITLE_MAX} caracteres);`,
        `- "summary": resumo de UMA linha do pedido, em português do Brasil (no máximo ${ORDER_SUMMARY_MAX} caracteres).`,
    ].join("\n")
}

export function buildOrderTitlePrompt(input: { code: string; businessName: string | null; description: string }): string {
    const description = input.description.trim().length > 6000 ? `${input.description.trim().slice(0, 6000)}… (cortado)` : input.description.trim()
    return [`# Pedido ${input.code}`, input.businessName ? `- Negócio: ${input.businessName}` : null, `## Necessidade do cliente\n${description}`, "Escreva o título curto e o resumo de uma linha."].filter(Boolean).join("\n\n")
}

const responseSchema = z.object({ title: z.string().trim().nullish(), summary: z.string().trim().nullish() })

/** Extrai o JSON (tolera cercas ```json e texto em volta); `null` quando inválido. */
export function parseOrderTitle(text: string): { title: string | null; summary: string | null } | null {
    const segments = text.includes("```") ? text.split("```") : [text]
    for (const segment of segments) {
        const start = segment.indexOf("{")
        const end = segment.lastIndexOf("}")
        if (start === -1 || end <= start) continue
        try {
            const parsed = responseSchema.safeParse(JSON.parse(segment.slice(start, end + 1)))
            if (!parsed.success) continue
            const clip = (value: string | null | undefined, max: number) => (value?.trim() ? value.trim().replace(/\s+/g, " ").slice(0, max) : null)
            return { title: clip(parsed.data.title, ORDER_TITLE_MAX), summary: clip(parsed.data.summary, ORDER_SUMMARY_MAX) }
        } catch {
            continue
        }
    }
    return null
}

async function finish(orderId: string, set: Record<string, unknown>): Promise<void> {
    const doc = await orderModels().orders.findOneAndUpdate({ _id: orderId }, { $set: set }, { timestamps: false, returnDocument: "after" }).select({ ownerId: 1, businessId: 1 }).lean()
    if (doc) await publishSpaceChanged(doc.ownerId, doc.businessId, "orders")
}

/** Gera título/resumo do pedido; no-op silencioso quando o pedido não existe mais. */
export async function generateOrderTitle(orderId: string): Promise<void> {
    try {
        await dbConnect()
        const order = await orderModels().orders.findById(orderId).select({ code: 1, description: 1, businessId: 1, titleManual: 1, summaryManual: 1 }).lean()
        if (!order) return
        const source = await orderModels().orders.findById(orderId).lean<OrderDoc>()
        if (!source || !["draft", "sent"].includes(source.status)) return
        if (order.titleManual && order.summaryManual) return finish(orderId, { aiStatus: "idle", aiError: null })
        const { settings } = await loadOrderTitleSettings()
        // Desligado: sem erro; o título exibido segue a primeira linha da descrição.
        if (!settings.enabled) return finish(orderId, { aiStatus: "idle", aiError: null })
        const status = await orderTitleAvailability(settings)
        if (!status.available || !settings.main.provider || !settings.main.model) return finish(orderId, { aiStatus: "error", aiError: status.reason ?? "Geração por IA indisponível" })
        const sourceHash = orderSourceHash(order.description)
        const business = await businessModels().businesses.findById(order.businessId).select({ name: 1 }).lean()
        let text = ""
        let last: AiStreamEvent | null = null
        for await (const event of streamAi({
            provider: settings.main.provider,
            model: settings.main.model,
            variant: settings.main.variant,
            temperature: settings.main.temperature,
            maxOutputTokens: settings.main.maxOutputTokens,
            instructions: buildOrderTitleInstructions(settings.instructions),
            prompt: buildOrderTitlePrompt({ code: order.code, businessName: business?.name ?? null, description: order.description }),
            title: `Pedido ${order.code}`,
            signal: AbortSignal.timeout(60_000),
            consumption: { origin: ORDER_TITLE_CONSUMPTION_ORIGIN, subject: orderId },
        })) {
            if (event.type === "delta") text += event.text
            if (event.type === "done" || event.type === "error") last = event
        }
        if (last?.type === "error") return finish(orderId, { aiStatus: "error", aiError: last.message })
        const parsed = parseOrderTitle(text)
        if (!parsed) return finish(orderId, { aiStatus: "error", aiError: "A IA não devolveu um título/resumo válido" })
        // Nunca sobrescreve uma descrição mais recente nem o que virou manual nesse meio-tempo.
        await mongoose.connection.transaction(async (session) => {
            await businessModels().ownerStates.updateOne({ _id: source.ownerId }, { $inc: { fence: 1 } }, { session, upsert: true })
            const still = await orderModels().orders.findById(orderId).session(session).lean<OrderDoc>()
            const active = await businessModels().businesses.exists({ _id: source.businessId, status: "active" }).session(session)
            if (!active || !still || !["draft", "sent"].includes(still.status) || orderSourceHash(still.description) !== sourceHash) return
            const patch = {
                ...(still.titleManual ? {} : { title: parsed.title }),
                ...(still.summaryManual ? {} : { summary: parsed.summary }),
                aiSourceHash: sourceHash, aiStatus: "done", aiError: null,
            }
            const changed = (!still.titleManual && still.title !== parsed.title) || (!still.summaryManual && still.summary !== parsed.summary)
            await orderModels().orders.updateOne({ _id: still._id }, { $set: patch, ...(changed ? { $inc: { version: 1 } } : {}) }, { session })
            if (changed && still.firstSentAt) {
                const number = still.versionCount + 1
                await orderModels().orderVersions.create([{ orderId, businessId: still.businessId, number, reason: "edit", published: still.status === "sent", snapshot: snapshotOf({ ...still, ...patch }), actorId: "system:order-title", simulation: null }], { session })
                await orderModels().orders.updateOne({ _id: still._id }, { $set: { versionCount: number } }, { session })
            }
        })
        await publishSpaceChanged(source.ownerId, source.businessId, "orders")
    } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao gerar o título por IA"
        log.warn({ err: message, orderId }, "[pedidos] falha na geração por IA")
        await finish(orderId, { aiStatus: "error", aiError: message }).catch(() => undefined)
    }
}
