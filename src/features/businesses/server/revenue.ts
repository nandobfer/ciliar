import { EMPTY_MEASUREMENT, type GoalMeasurement, type GoalWindow } from "../goal-progress"

/**
 * Medição do faturamento bruto das metas — SOMENTE servidor.
 *
 * Faturamento bruto = soma dos valores recebidos dos trabalhos em **Pago** e não arquivados, pela
 * **data do pagamento**; horas = horas apontadas nesses trabalhos. Os trabalhos chegam com o M4: até
 * lá não há pagamentos, então toda janela mede zero (regra do `docs/modulos/m2-espaco-negocio.md`:
 * "até M3/M4, o dashboard mostra só as metas, com progresso zero"). O M4 passa a consultar os
 * trabalhos pagos aqui, sem mudar quem chama.
 */
export async function measureGoalWindows(_businessId: string, windows: readonly GoalWindow[]): Promise<Map<string, GoalMeasurement>> {
    return new Map(windows.map((window) => [window.key, { ...EMPTY_MEASUREMENT }]))
}
