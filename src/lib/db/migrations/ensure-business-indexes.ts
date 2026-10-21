import { businessModels } from "@/features/businesses/server/models"
import { ensureGoalIndexes } from "@/features/businesses/server/goals"

/**
 * Índices dos Negócios e do Agente Entrevistador (inclusive a entrevista única em andamento por dono)
 * e a "uma meta ativa por negócio" (normaliza os dados antigos antes do índice único). Idempotente.
 */
export async function ensureBusinessIndexes(): Promise<void> {
    await Promise.all(Object.values(businessModels()).map((model) => model.createIndexes()))
    await ensureGoalIndexes()
}
