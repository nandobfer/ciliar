import { businessModels } from "@/features/businesses/server/models"
import { ensureGoalIndexes } from "@/features/businesses/server/goals"
import { orderModels } from "@/features/orders/server/models"

/**
 * Índices dos Negócios, Clientes/Pedidos/Trabalhos (M3) e do Agente Entrevistador (inclusive a entrevista única em andamento por dono)
 * e a "uma meta ativa por negócio" (normaliza os dados antigos antes do índice único). Idempotente.
 */
export async function ensureBusinessIndexes(): Promise<void> {
    await Promise.all([...Object.values(businessModels()), ...Object.values(orderModels())].map((model) => model.createIndexes()))
    await ensureGoalIndexes()
}
