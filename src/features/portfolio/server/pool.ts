import type { ClientSession, Types } from "mongoose"
import { businessModels, type BusinessActivityRecord, type BusinessDocumentRecord, type BusinessFileRef, type BusinessPortfolioItemRecord, type BusinessSuccessRecord } from "@/features/businesses/server/models"
import { orderModels } from "@/features/orders/server/models"
import type { ContentPool, PoolFile } from "../resolve"

/**
 * Conteúdo do negócio que pode entrar no portfólio (M5) — SOMENTE servidor. Elegíveis: sucessos
 * ativos, documentos ativos marcados "Usar no portfólio", atividades ativas (situação e "ativa") e
 * itens avulsos ativos. O nome do cliente vai junto (o resolvedor só o publica quando autorizado).
 */

type SuccessDoc = BusinessSuccessRecord & { _id: Types.ObjectId }
type DocumentDoc = BusinessDocumentRecord & { _id: Types.ObjectId }
type ActivityDoc = BusinessActivityRecord & { _id: Types.ObjectId }
export type PortfolioItemDoc = BusinessPortfolioItemRecord & { _id: Types.ObjectId }

const iso = (value: Date | string | undefined | null) => (value ? new Date(value).toISOString() : new Date(0).toISOString())
const file = (ref: BusinessFileRef): PoolFile => ({ id: ref.id, name: ref.name, mediaType: ref.mediaType, size: ref.size })

export interface LoadedPool {
    pool: ContentPool
    /** Existem, mas não estão disponíveis agora. */
    unavailable: Record<keyof ContentPool, number>
}

export async function loadContentPool(businessId: string, ownerId: string, session: ClientSession | null = null): Promise<LoadedPool> {
    const models = businessModels()
    const [successes, documents, activities, items] = await Promise.all([
        models.successes.find({ businessId }).sort({ date: -1, createdAt: -1 }).session(session).lean<SuccessDoc[]>(),
        models.documents.find({ businessId }).sort({ createdAt: -1 }).session(session).lean<DocumentDoc[]>(),
        models.activities.find({ businessId }).sort({ name: 1 }).session(session).lean<ActivityDoc[]>(),
        models.portfolioItems.find({ businessId }).sort({ createdAt: -1 }).session(session).lean<PortfolioItemDoc[]>(),
    ])
    const activeSuccesses = successes.filter((doc) => doc.status === "active")
    const activeDocuments = documents.filter((doc) => doc.status === "active" && doc.portfolio === true && doc.file)
    const activeServices = activities.filter((doc) => doc.status === "active" && doc.active !== false)
    const activeItems = items.filter((doc) => doc.status === "active")
    const clientIds = [...new Set(activeSuccesses.map((doc) => doc.clientId).filter((id): id is string => Boolean(id)))]
    const clients = clientIds.length ? await orderModels().clients.find({ _id: { $in: clientIds }, ownerId }).select({ name: 1 }).session(session).lean() : []
    const names = new Map(clients.map((client) => [String(client._id), client.name]))
    return {
        pool: {
            services: activeServices.map((doc) => ({ id: doc._id.toString(), name: doc.name, description: doc.description ?? null, createdAt: iso(doc.createdAt) })),
            successes: activeSuccesses.map((doc) => ({
                id: doc._id.toString(),
                title: doc.title,
                description: doc.description ?? null,
                date: doc.date ?? null,
                result: doc.result ?? null,
                clientName: doc.clientId ? (names.get(doc.clientId) ?? null) : null,
                images: (doc.attachments ?? []).map(file),
                createdAt: iso(doc.createdAt),
            })),
            documents: activeDocuments.map((doc) => ({ id: doc._id.toString(), name: doc.name, description: doc.description ?? null, file: file(doc.file), createdAt: iso(doc.createdAt) })),
            items: activeItems.map((doc) => ({ id: doc._id.toString(), title: doc.title, description: doc.description ?? null, url: doc.url ?? null, date: doc.date ?? null, tags: doc.tags ?? [], images: (doc.images ?? []).map(file), createdAt: iso(doc.createdAt) })),
        },
        unavailable: {
            successes: successes.length - activeSuccesses.length,
            documents: documents.filter((doc) => doc.status !== "active" || doc.portfolio !== true).length,
            services: activities.length - activeServices.length,
            items: items.length - activeItems.length,
        },
    }
}
