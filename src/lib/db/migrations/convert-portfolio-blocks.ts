import mongoose from "mongoose"
import { orderedIds } from "@/features/portfolio/logic"
import { blocksFromLegacy } from "@/features/portfolio/templates"

/**
 * Portfólio (M5) virou editor de blocos (22/10/2026): cada portfólio antigo (seções e seleções) vira
 * blocos de Seção "escolhidos um a um", na ordem salva e só as visíveis, gravados como rascunho E
 * publicado (a página pública não muda). Os campos antigos saem. Idempotente: só converte quem ainda
 * não tem `draft`.
 *
 * Roda dentro de `dbConnect()`: NUNCA chame `dbConnect()` aqui (deadlock — ver base.md).
 */
export async function convertPortfolioBlocks(connection = mongoose.connection): Promise<number> {
    const portfolios = connection.collection("business_portfolios")
    const items = connection.collection("business_portfolio_items")
    const legacy = await portfolios.find({ draft: { $exists: false } }).toArray()
    let converted = 0
    for (const doc of legacy) {
        const active = await items.find({ businessId: doc.businessId, status: "active" }).sort({ createdAt: -1 }).project({ _id: 1 }).toArray()
        const blocks = blocksFromLegacy({
            sections: doc.sections,
            successes: doc.successes,
            documents: doc.documents,
            services: doc.services,
            items: orderedIds((doc.itemOrder as string[] | undefined) ?? [], active.map((item) => String(item._id))),
        })
        const now = new Date()
        const updated = await portfolios.updateOne(
            { _id: doc._id, draft: { $exists: false } },
            {
                $set: {
                    draft: { blocks, version: 0, updatedAt: now, updatedBy: "system" },
                    live: { blocks, number: doc.published || blocks.length ? 1 : 0, publishedAt: doc.published ? (doc.publishedAt ?? now) : blocks.length ? now : null, publishedBy: doc.published || blocks.length ? "system" : null },
                    started: true,
                },
                $unset: { sections: "", successes: "", documents: "", services: "", itemOrder: "" },
            },
        )
        if (!updated.modifiedCount) continue
        converted += 1
        if (blocks.length || doc.published) {
            await connection.collection("business_portfolio_publications").updateOne(
                { businessId: doc.businessId, number: 1 },
                { $setOnInsert: { businessId: doc.businessId, ownerId: doc.ownerId, number: 1, blocks, publishedAt: doc.publishedAt ?? now, publishedBy: "system" } },
                { upsert: true },
            )
        }
    }
    return converted
}
