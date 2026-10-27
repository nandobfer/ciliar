import { describe, expect, it } from "vitest"
import { availabilityIntervals, CONFLICT_HORIZON_DAYS, deadlineConflict, intersectIntervals, intervalsMinutes, mergeIntervals, workOccupationMinutes, type ConflictWork, type DeadlineConflictInput } from "@/features/calendar/conflict"
import { dayEnd, dayKeyOf, dayStart, localToInstant, minuteOfDay, rangeOfView, shiftAnchor, weekdayOfKey, isDateKey } from "@/features/calendar/time"
import { googleEventBody, orderStatusTag, pushedHash, workStatusTag, dueDateFromGoogle } from "@/features/calendar/events"
import { eventsOfDay, layoutTimed, minuteAtOffset, offWindows } from "@/features/calendar/components/calendar-layout"
import { businessRouteAccess, BUSINESS_FULL_PERMISSIONS, BUSINESS_SPACE_SEGMENT_MODULES } from "@/features/businesses/permissions"
import { businessRoutePermissions, requiresPanel } from "@/features/access/server/policy"
import type { CalendarEventDto } from "@/features/calendar/types"

const TZ = "America/Sao_Paulo"
const H = 60
/** Segunda-feira, 2 de novembro de 2026, 09:00 em São Paulo (UTC−3). */
const MONDAY_9H = Date.parse("2026-11-02T12:00:00Z")
const WEEKDAYS_9_18 = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "09:00", end: "18:00" }))

const work = (over: Partial<ConflictWork> = {}): ConflictWork => ({ id: "w1", businessId: "b1", code: "PED-0001", title: "Site", startKey: "2026-11-01", dueDate: "2026-11-06", estimatedMinutes: 10 * H, loggedMinutes: 0, ...over })
const input = (over: Partial<DeadlineConflictInput> = {}): DeadlineConflictInput => ({ now: MONDAY_9H, timeZone: TZ, dueDate: "2026-11-06", estimatedMinutes: 0, works: [], availabilities: [WEEKDAYS_9_18], busy: [], ...over })

describe("datas no fuso do usuário", () => {
    it("converte dia + minuto em instante (inclusive outro fuso) e de volta", () => {
        expect(new Date(localToInstant("2026-11-02", 9 * H, TZ)).toISOString()).toBe("2026-11-02T12:00:00.000Z")
        expect(new Date(localToInstant("2026-11-02", 9 * H, "Europe/Lisbon")).toISOString()).toBe("2026-11-02T09:00:00.000Z")
        expect(minuteOfDay(MONDAY_9H, TZ)).toBe(9 * H)
        expect(dayKeyOf(Date.parse("2026-11-03T02:30:00Z"), TZ)).toBe("2026-11-02")
        expect(dayEnd("2026-11-02", TZ) - dayStart("2026-11-02", TZ)).toBe(24 * H * 60_000)
        // Virada do horário de verão em Nova York (dia de 23 h).
        expect((dayEnd("2026-03-08", "America/New_York") - dayStart("2026-03-08", "America/New_York")) / 3_600_000).toBe(23)
        expect(weekdayOfKey("2026-11-02")).toBe(1)
        expect(isDateKey("2026-02-30")).toBe(false)
        expect(isDateKey("2026-02-28")).toBe(true)
    })
    it("períodos das visões e navegação", () => {
        expect(rangeOfView("day", "2026-11-04")).toEqual({ from: "2026-11-04", to: "2026-11-04" })
        expect(rangeOfView("week", "2026-11-04")).toEqual({ from: "2026-11-01", to: "2026-11-07" })
        expect(rangeOfView("month", "2026-11-15")).toEqual({ from: "2026-11-01", to: "2026-12-05" })
        expect(shiftAnchor("month", "2026-12-31", 1)).toBe("2027-01-01")
        expect(shiftAnchor("week", "2026-11-04", -1)).toBe("2026-10-28")
    })
})

describe("expediente (união das janelas)", () => {
    it("une negócios sem contar a mesma hora duas vezes; dia sem janela vale 24 h; sem disponibilidade não soma", () => {
        const other = [{ weekday: 1, start: "14:00", end: "20:00" }, { weekday: 6, start: null, end: null }]
        const intervals = availabilityIntervals([WEEKDAYS_9_18, other, []], dayStart("2026-11-02", TZ), "2026-11-07", TZ)
        // Seg 09–20 (11 h), Ter–Sex 9 h cada (36 h), Sáb 24 h.
        expect(intervalsMinutes(intervals)).toBe((11 + 36 + 24) * H)
        expect(intervalsMinutes(availabilityIntervals([[]], dayStart("2026-11-02", TZ), "2026-11-07", TZ))).toBe(0)
    })
    it("começa agora (o que sobra de hoje) e termina no fim do prazo", () => {
        const now = Date.parse("2026-11-02T19:00:00Z") // 16:00
        expect(intervalsMinutes(availabilityIntervals([WEEKDAYS_9_18], now, "2026-11-02", TZ))).toBe(2 * H)
        expect(availabilityIntervals([WEEKDAYS_9_18], now, "2026-11-01", TZ)).toEqual([])
    })
    it("une e intersecta intervalos", () => {
        expect(mergeIntervals([[5, 10], [0, 6], [12, 14]])).toEqual([[0, 10], [12, 14]])
        expect(intersectIntervals([[0, 10], [20, 30]], [[5, 25]])).toEqual([[5, 10], [20, 25]])
    })
})

describe("deadlineConflict()", () => {
    it("sem prazo: nada; sem horas estimadas: só sobreposição", () => {
        expect(deadlineConflict(input({ dueDate: null, works: [work()] }))).toMatchObject({ level: "none", overlap: [], capacity: null })
        const result = deadlineConflict(input({ works: [work()] }))
        expect(result.level).toBe("info")
        expect(result.capacity).toBeNull()
        expect(result.overlap.map((item) => item.id)).toEqual(["w1"])
    })
    it("capacidade: expediente de agora até D menos as horas restantes e os ocupados do Google", () => {
        // Seg 9h → Sex 18h = 45 h; trabalho com 10 h restantes (prazo até D); Google 2 h dentro + 3 h fora do expediente.
        const busy = [
            [Date.parse("2026-11-03T13:00:00Z"), Date.parse("2026-11-03T15:00:00Z")],
            [Date.parse("2026-11-03T22:00:00Z"), Date.parse("2026-11-04T01:00:00Z")],
        ] as const
        const result = deadlineConflict(input({ estimatedMinutes: 34 * H, works: [work()], busy }))
        expect(result.capacity).toMatchObject({ availableMinutes: 45 * H, worksMinutes: 10 * H, busyMinutes: 2 * H, freeMinutes: 33 * H, insufficient: true })
        expect(result.level).toBe("strong")
        expect(deadlineConflict(input({ estimatedMinutes: 33 * H, works: [work()], busy })).capacity?.insufficient).toBe(false)
    })
    it("horas apontadas acima das estimadas: restante 0; o próprio trabalho não entra", () => {
        expect(deadlineConflict(input({ estimatedMinutes: 45 * H, works: [work({ loggedMinutes: 12 * H })] })).capacity?.freeMinutes).toBe(45 * H)
        const self = deadlineConflict(input({ estimatedMinutes: 45 * H, works: [work()], selfWorkId: "w1" }))
        expect(self.capacity?.freeMinutes).toBe(45 * H)
        expect(self.overlap).toEqual([])
    })
    it("prazo depois de D: só a parte proporcional ao expediente até D", () => {
        // Período do trabalho: hoje (seg 9h) até a sexta da semana seguinte (90 h de expediente); até D (sex) = 45 h → metade.
        const later = work({ dueDate: "2026-11-13", estimatedMinutes: 20 * H })
        expect(workOccupationMinutes(later, input(), "2026-11-06")).toBe(10 * H)
        expect(workOccupationMinutes(work({ dueDate: null }), input(), "2026-11-06")).toBe(0)
    })
    it("prazo no passado ou hoje: sobra de hoje ou zero, alerta forte com horas estimadas", () => {
        expect(deadlineConflict(input({ dueDate: "2026-11-01", estimatedMinutes: 60 })).capacity).toMatchObject({ availableMinutes: 0, insufficient: true })
        expect(deadlineConflict(input({ dueDate: "2026-11-02", estimatedMinutes: 60 })).capacity).toMatchObject({ availableMinutes: 9 * H, insufficient: false })
    })
    it("nenhum negócio com disponibilidade: expediente zero e o aviso de expediente não configurado", () => {
        expect(deadlineConflict(input({ availabilities: [[], []], estimatedMinutes: 60 })).capacity).toMatchObject({ availableMinutes: 0, noAvailability: true, insufficient: true })
    })
    it("trabalho sem sobreposição (começa depois do prazo) não avisa", () => {
        expect(deadlineConflict(input({ works: [work({ startKey: "2026-11-09", dueDate: "2026-11-12" })] })).level).toBe("none")
    })
})

describe("eventos publicados no Google", () => {
    const source = { kind: "work-period" as const, linkId: "l1", code: "PED-0001", title: "Site", businessName: "Studio", clientName: "Cliente", startKey: "2026-11-01", dueDate: "2026-11-06", statusTag: null, columnName: "Execução", estimatedMinutes: 90, url: "https://app/x" }
    it("dia inteiro com fim exclusivo, marca do Ciliar, status no título e hash estável", () => {
        const body = googleEventBody(source)
        expect(body).toMatchObject({ summary: "Execução: PED-0001 · Site", start: { date: "2026-11-01" }, end: { date: "2026-11-07" }, transparency: "transparent", extendedProperties: { private: { ciliar: "1", ciliarLinkId: "l1" } } })
        expect(googleEventBody({ ...source, kind: "work-deadline", statusTag: "Pago" })).toMatchObject({ summary: "Prazo: PED-0001 · Site [Pago]", start: { date: "2026-11-06" } })
        expect(pushedHash(body)).toBe(pushedHash(googleEventBody(source)))
        expect(pushedHash(body)).not.toBe(pushedHash(googleEventBody({ ...source, dueDate: "2026-11-07" })))
    })
    it("status do trabalho e do pedido como histórico", () => {
        expect(workStatusTag({ column: "execution", status: "active" })).toBeNull()
        expect(workStatusTag({ column: "paid", status: "active" })).toBe("Pago")
        expect(workStatusTag({ column: "paid", status: "archived" })).toBe("Arquivado")
        expect(workStatusTag(null)).toBe("Excluído")
        expect(orderStatusTag("draft", false)).toBeNull()
        expect(orderStatusTag("sent", true)).toBe("Expirado")
        expect(orderStatusTag("cancelled", false)).toBe("Cancelado")
    })
    it("data nova vinda do Google: fim exclusivo − 1 dia", () => {
        expect(dueDateFromGoogle({ end: { date: "2026-11-10" } }, () => "x")).toBe("2026-11-09")
        expect(dueDateFromGoogle({ end: { dateTime: "2026-11-10T15:00:00-03:00" } }, () => "2026-11-10")).toBe("2026-11-10")
        expect(dueDateFromGoogle({}, () => "x")).toBeNull()
    })
})

describe("disposição das visões", () => {
    const base = { businessId: "b", businessName: "B", color: "#000", subtitle: null, workId: null, orderId: null, code: null, statusLabel: null, orderStatus: null, column: null, deadlineLabel: null, deadlineOverdue: false, conflict: null, draggable: false, version: null, minutes: null, details: null, google: null, googleLink: null } as const
    const event = (over: Partial<CalendarEventDto>): CalendarEventDto => ({ ...base, id: Math.random().toString(), kind: "google", title: "E", allDay: true, start: "2026-11-02", end: "2026-11-02", ...over })
    it("eventos do dia em ordem (prazos primeiro) e com hora no fuso", () => {
        const list = [event({ kind: "work-period", start: "2026-11-01", end: "2026-11-06", title: "P" }), event({ kind: "work-deadline", title: "D" }), event({ kind: "google", allDay: false, start: "2026-11-02T13:00:00.000Z", end: "2026-11-02T14:00:00.000Z", title: "G" })]
        expect(eventsOfDay(list, "2026-11-02", { timeZone: TZ }).map((item) => item.title)).toEqual(["D", "G", "P"])
        expect(eventsOfDay(list, "2026-11-02", { includeTimed: false }).map((item) => item.title)).toEqual(["D", "P"])
    })
    it("grade de horários: posição, faixas sobrepostas, ponteiro e fora do expediente", () => {
        const placed = layoutTimed(
            [event({ allDay: false, start: "2026-11-02T12:00:00.000Z", end: "2026-11-02T13:00:00.000Z" }), event({ allDay: false, start: "2026-11-02T12:30:00.000Z", end: "2026-11-02T13:30:00.000Z" })],
            "2026-11-02",
            TZ,
            48,
        )
        expect(placed.map((item) => [item.top, item.height, item.lane, item.lanes])).toEqual([
            [9 * 48, 48, 0, 2],
            [9.5 * 48, 48, 1, 2],
        ])
        expect(minuteAtOffset(48 * 9 + 30)).toBe(9 * H + 30)
        expect(minuteAtOffset(-5)).toBe(0)
        expect(offWindows([[9 * H, 18 * H]])).toEqual([[0, 9 * H], [18 * H, 24 * H]])
        expect(offWindows([])).toEqual([[0, 24 * H]])
    })
})

describe("permissões e rotas do Calendário", () => {
    it("módulo calendar.view nas chaves completas, na página, na aba e nas APIs", () => {
        expect(BUSINESS_FULL_PERMISSIONS).toContain("calendar.view")
        expect(BUSINESS_SPACE_SEGMENT_MODULES.calendario).toBe("calendar")
        const page = businessRouteAccess("/calendario")!
        expect(page((key) => ["businesses.use", "calendar.view"].includes(key))).toBe(true)
        expect(page((key) => key === "businesses.use")).toBe(false)
        expect(businessRouteAccess("/negocios/" + "a".repeat(24) + "/calendario")!((key) => key === "businesses.view_all")).toBe(true)
        expect(requiresPanel("/api/calendar/events")).toBe(false)
        expect(businessRoutePermissions("/api/calendar/events", "GET")).toEqual([])
        expect(businessRoutePermissions("/api/calendar/events", "POST")).toBeNull()
        expect(businessRoutePermissions("/api/calendar/google/connect", "POST")).toEqual(["businesses.use", "calendar.view"])
        expect(businessRoutePermissions("/api/calendar/google", "DELETE")).toEqual(["businesses.use", "calendar.view"])
    })
})

describe("horizonte do cálculo (prazos absurdos)", () => {
    it("prazo no ano 9999: responde rápido, sem capacidade calculável (só a sobreposição)", () => {
        const started = performance.now()
        const result = deadlineConflict(input({ dueDate: "9999-12-31", estimatedMinutes: 10 * H, works: [work({ dueDate: "9999-12-31" })] }))
        expect(performance.now() - started).toBeLessThan(1_000)
        expect(result.capacity).toBeNull()
        expect(result.overlap).toHaveLength(1)
    })
    it("o expediente para no horizonte; trabalho com prazo além dele ocupa pela proporção estimada", () => {
        const started = performance.now()
        const far = availabilityIntervals([WEEKDAYS_9_18], MONDAY_9H, "9999-12-31", TZ)
        expect(intervalsMinutes(far)).toBeLessThanOrEqual((CONFLICT_HORIZON_DAYS + 1) * 9 * H)
        // 2 anos de prazo, 1000 h: até sexta (~1 semana de ~104 semanas), uma fração pequena e finita.
        const minutes = workOccupationMinutes(work({ dueDate: "2028-11-03", estimatedMinutes: 1000 * H }), input(), "2026-11-06")
        expect(minutes).toBeGreaterThan(0)
        expect(minutes).toBeLessThan(20 * H)
        expect(workOccupationMinutes(work({ dueDate: "9999-12-31", estimatedMinutes: 1000 * H }), input(), "2026-11-06")).toBeGreaterThanOrEqual(0)
        expect(performance.now() - started).toBeLessThan(1_000)
    })
})
