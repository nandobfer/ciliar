import { z } from "zod"
import { objectId } from "@/features/access/schemas"
import { CALENDAR_EVENT_KINDS, CALENDAR_MAX_RANGE_DAYS, GOOGLE_LINK_KINDS, GOOGLE_READ_CALENDARS_MAX } from "./constants"
import { daysBetweenKeys, isDateKey } from "./time"

const dateKey = z.string().refine(isDateKey, "Data no formato AAAA-MM-DD")

/** `GET /api/calendar/events?from=&to=&businessId=&types=a,b`. */
export const calendarRangeQuerySchema = z
    .object({
        from: dateKey,
        to: dateKey,
        businessId: objectId.optional(),
        types: z
            .string()
            .optional()
            .transform((value) => (value !== undefined ? value.split(",").filter((item): item is (typeof CALENDAR_EVENT_KINDS)[number] => (CALENDAR_EVENT_KINDS as readonly string[]).includes(item)) : [...CALENDAR_EVENT_KINDS])),
    })
    .refine((query) => query.from <= query.to, "O início precisa ser antes do fim")
    .refine((query) => daysBetweenKeys(query.from, query.to) <= CALENDAR_MAX_RANGE_DAYS, `Período de até ${CALENDAR_MAX_RANGE_DAYS} dias`)
export type CalendarRangeQuery = z.output<typeof calendarRangeQuerySchema>

/** Verificar conflito: por data + horas estimadas ou a partir de um pedido/trabalho (a data informada prevalece). */
export const deadlineConflictInputSchema = z
    .object({
        businessId: objectId.optional(),
        dueDate: dateKey.nullable().optional(),
        estimatedMinutes: z.coerce.number().int().min(0).max(1_000_000).optional(),
        orderId: objectId.optional(),
        workId: objectId.optional(),
    })
    .refine((input) => input.dueDate || input.orderId || input.workId, "Informe a data ou o pedido/trabalho")
    .refine((input) => !(input.orderId || input.workId) || input.businessId, "Informe o negócio do pedido/trabalho")
export type DeadlineConflictInput = z.output<typeof deadlineConflictInputSchema>

export const googleSettingsSchema = z.object({
    publishCalendarId: z.string().trim().min(1).max(300).nullable().optional(),
    readCalendarIds: z.array(z.string().trim().min(1).max(300)).max(GOOGLE_READ_CALENDARS_MAX).optional(),
})
export type GoogleSettingsInput = z.output<typeof googleSettingsSchema>

export const googleRepublishSchema = z.union([
    z.object({ all: z.literal(true) }),
    z.object({ kind: z.enum(GOOGLE_LINK_KINDS), id: objectId }),
])
export type GoogleRepublishInput = z.output<typeof googleRepublishSchema>

export const googleConnectSchema = z.object({ returnTo: z.string().max(300).optional() })
