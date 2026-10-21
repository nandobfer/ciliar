import { businessModels } from "@/features/businesses/server/models"
import { ensureGoalIndexes } from "@/features/businesses/server/goals"
import { orderModels } from "@/features/orders/server/models"
import { workModels } from "@/features/works/server/models"

/**
 * Índices dos Negócios, Clientes/Pedidos (M3), Trabalhos (M4: colunas, movimentações, notas e horas) e do Agente Entrevistador (inclusive a entrevista única em andamento por dono)
 * e a "uma meta ativa por negócio" (normaliza os dados antigos antes do índice único). Idempotente.
 */
export async function ensureBusinessIndexes(): Promise<void> {
    await Promise.all([...Object.values(businessModels()), ...Object.values(orderModels()), ...Object.values(workModels())].map((model) => model.createIndexes()))
    await ensureGoalIndexes()
}
