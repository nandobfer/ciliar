import { calendarModels } from "@/features/calendar/server/models"

/** Índices do Calendário (conexões Google, vínculos evento ↔ item e estados do OAuth com TTL). Idempotente, sem `dbConnect`. */
export async function ensureCalendarIndexes(): Promise<void> {
    await Promise.all(Object.values(calendarModels()).map((model) => model.createIndexes()))
}
