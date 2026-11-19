import { z } from "zod"
import { objectId } from "@/features/access/schemas"
import { CALENDAR_EVENT_KINDS } from "@/features/calendar/constants"
import { checkDeadlineConflict } from "@/features/calendar/server/conflict"
import { syncGoogleNow } from "@/features/calendar/server/google/service"
import { listCalendarEvents } from "@/features/calendar/server/range"
import { defineTool } from "./define"

/**
 * Calendário (CIL-4): ler o calendário, verificar conflito de prazo e sincronizar o Google Agenda.
 * Executam os serviços reais com o acesso revalidado (nunca HTTP). Conectar/desconectar o Google e
 * trocar as agendas mexem em credencial: só pela tela.
 */

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "AAAA-MM-DD")

export const calendarTools = [
    defineTool("list_calendar_events", {
        input: z.object({
            from: dateField.describe("Primeiro dia (AAAA-MM-DD)"),
            to: dateField.describe("Último dia (AAAA-MM-DD, até 62 dias depois)"),
            businessId: objectId.optional().describe("Só um negócio (de list_businesses)"),
            types: z.array(z.enum(CALENDAR_EVENT_KINDS)).optional().describe("Tipos (padrão: todos)"),
        }),
        execute: async (input, { access }) => {
            const range = await listCalendarEvents(access, { from: input.from, to: input.to, businessId: input.businessId, types: input.types?.join(",") })
            return {
                from: range.from,
                to: range.to,
                timeZone: range.timeZone,
                events: range.events.map((event) => ({
                    kind: event.kind,
                    title: event.title,
                    businessId: event.businessId,
                    businessName: event.businessName,
                    start: event.start,
                    end: event.end,
                    allDay: event.allDay,
                    code: event.code,
                    workId: event.workId,
                    orderId: event.orderId,
                    status: event.statusLabel,
                    deadline: event.deadlineLabel,
                    conflict: event.conflict,
                    minutes: event.minutes,
                    details: event.details,
                    calendar: event.google?.calendarName ?? null,
                })),
                availability: range.availability.filter((day) => day.windows.length),
                noAvailability: range.noAvailability,
                conflicts: range.conflicts,
                google: range.google ? { connected: range.google.connected, status: range.google.status, publishCalendar: range.google.publishCalendarName, readCalendars: range.google.readCalendars.map((calendar) => calendar.name) } : null,
                googleError: range.googleError,
            }
        },
    }),
    defineTool("check_deadline_conflict", {
        input: z.object({
            businessId: objectId.optional().describe("Negócio do pedido/trabalho (obrigatório com orderId/workId)"),
            dueDate: dateField.optional().describe("Prazo a verificar (AAAA-MM-DD)"),
            estimatedMinutes: z.number().int().min(0).max(1_000_000).optional().describe("Horas estimadas em minutos (padrão: as do pedido; no trabalho, as restantes)"),
            orderId: objectId.optional(),
            workId: objectId.optional(),
        }),
        execute: async (input, { access }) => {
            const result = await checkDeadlineConflict(access, input)
            return {
                level: result.level,
                dueDate: result.dueDate,
                overlap: result.overlap.map((item) => ({ ...item, businessName: result.businessNames[item.businessId] ?? null })),
                overlapCount: result.overlapCount,
                capacity: result.capacity,
                googleError: result.googleError,
                note: "O alerta nunca bloqueia: é só informativo (sobreposição) ou forte (capacidade).",
            }
        },
    }),
    defineTool("sync_google_calendar", {
        input: z.object({}),
        summarize: () => "Sincronizar agora o Google Agenda conectado (aplicar datas movidas no Google e publicar as pendências)",
        execute: async (_input, { access }) => {
            const result = await syncGoogleNow(access)
            return { published: result.published, applied: result.applied, unlinked: result.unlinked, corrected: result.corrected, errors: result.errors, status: result.connection.status, lastError: result.connection.lastError }
        },
    }),
]
