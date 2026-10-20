import { businessModels } from "@/features/businesses/server/models"

/** Índices dos Negócios e do Agente Entrevistador (inclusive a entrevista única em andamento por dono). Idempotente. */
export async function ensureBusinessIndexes(): Promise<void> {
    await Promise.all(Object.values(businessModels()).map((model) => model.createIndexes()))
}
