import { addDaysToKey, dayEnd, dayKeyOf, dayStart, eachDayKey, hmToMinutes, localToInstant, MINUTE_MS, weekdayOfKey } from "./time"

/**
 * Horizonte do cálculo de capacidade (dias a partir do início): o expediente é montado dia a dia, então
 * um prazo absurdo (ano 9999) travaria o processo. Além dele, a capacidade não é calculada.
 */
export const CONFLICT_HORIZON_DAYS = 366

/**
 * Alerta de conflito de prazo (CIL-4) — módulo PURO, testável isolado. Dois níveis, NUNCA bloqueia:
 *
 * 1. **Sobreposição** (informativo): o intervalo do pedido (hoje — ou o aceite, se já for trabalho — até
 *    o prazo D) cruza o período (aceite → prazo) de algum trabalho em andamento.
 * 2. **Capacidade** (forte): horas estimadas do pedido > horas livres, em que livres = expediente de
 *    agora até o fim de D − ocupação (horas restantes dos trabalhos em andamento, proporcionais quando
 *    o prazo deles passa de D, + eventos "ocupado" do Google dentro do expediente).
 *
 * Expediente: união das janelas de todos os negócios ativos (a mesma hora não conta duas vezes); dia
 * sem janela vale 24 h; negócio sem disponibilidade não soma.
 */

export interface AvailabilityWindow {
    weekday: number
    start: string | null
    end: string | null
}

/** Intervalo `[início, fim)` em ms. */
export type Interval = readonly [number, number]

export interface ConflictWork {
    id: string
    businessId: string
    code: string
    title: string
    /** Dia do aceite (início do período). */
    startKey: string
    dueDate: string | null
    estimatedMinutes: number
    loggedMinutes: number
}

export interface DeadlineConflictInput {
    /** Agora (ms). */
    now: number
    timeZone: string
    dueDate: string | null
    estimatedMinutes: number
    /** Início do intervalo do item: o aceite, se já for trabalho; senão hoje. */
    startKey?: string | null
    /** O próprio item nunca entra na própria ocupação. */
    selfWorkId?: string | null
    /** Trabalhos em andamento (não arquivados e fora de Pago) de todos os negócios ativos do dono. */
    works: readonly ConflictWork[]
    /** Disponibilidade de cada negócio ativo. */
    availabilities: readonly (readonly AvailabilityWindow[])[]
    /** Eventos "ocupado" do Google (agendas lidas), em ms. */
    busy: readonly Interval[]
}

export interface ConflictOverlapItem {
    id: string
    businessId: string
    code: string
    title: string
    startKey: string
    dueDate: string
}

export interface ConflictCapacity {
    requiredMinutes: number
    /** Expediente de agora até o fim do prazo. */
    availableMinutes: number
    worksMinutes: number
    busyMinutes: number
    occupiedMinutes: number
    freeMinutes: number
    /** Nenhum negócio tem disponibilidade configurada. */
    noAvailability: boolean
    insufficient: boolean
}

export type ConflictLevel = "none" | "info" | "strong"

export interface DeadlineConflict {
    level: ConflictLevel
    dueDate: string | null
    overlap: ConflictOverlapItem[]
    capacity: ConflictCapacity | null
}

export function mergeIntervals(list: readonly Interval[]): Interval[] {
    const sorted = list.filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0])
    const out: [number, number][] = []
    for (const [start, end] of sorted) {
        const last = out[out.length - 1]
        if (last && start <= last[1]) last[1] = Math.max(last[1], end)
        else out.push([start, end])
    }
    return out
}

/** Interseção de dois conjuntos de intervalos (já unidos). */
export function intersectIntervals(a: readonly Interval[], b: readonly Interval[]): Interval[] {
    const left = mergeIntervals(a)
    const right = mergeIntervals(b)
    const out: Interval[] = []
    let i = 0
    let j = 0
    while (i < left.length && j < right.length) {
        const start = Math.max(left[i]![0], right[j]![0])
        const end = Math.min(left[i]![1], right[j]![1])
        if (end > start) out.push([start, end])
        if (left[i]![1] < right[j]![1]) i += 1
        else j += 1
    }
    return out
}

export const intervalsMinutes = (list: readonly Interval[]) => list.reduce((sum, [start, end]) => sum + (end - start), 0) / MINUTE_MS

/** Minutos dos intervalos dentro de `[from, to)`. */
export const minutesBetween = (list: readonly Interval[], from: number, to: number) => (to <= from ? 0 : intervalsMinutes(intersectIntervals(list, [[from, to]])))

/** Algum negócio tem disponibilidade? */
export const hasAvailability = (availabilities: readonly (readonly AvailabilityWindow[])[]) => availabilities.some((days) => days.length > 0)

/**
 * Expediente (união das janelas de todos os negócios) entre `from` (ms) e o fim do dia `toKey`, no fuso.
 * Dia sem janela vale o dia inteiro (24 h, ou 23/25 na virada do horário de verão).
 */
export function availabilityIntervals(availabilities: readonly (readonly AvailabilityWindow[])[], from: number, toKey: string, timeZone: string): Interval[] {
    const fromKey = dayKeyOf(from, timeZone)
    const capKey = addDaysToKey(fromKey, CONFLICT_HORIZON_DAYS)
    const lastKey = toKey < capKey ? toKey : capKey
    const end = dayEnd(lastKey, timeZone)
    if (end <= from) return []
    const raw: Interval[] = []
    for (const key of eachDayKey(fromKey, lastKey)) {
        const weekday = weekdayOfKey(key)
        for (const days of availabilities) {
            for (const day of days) {
                if (day.weekday !== weekday) continue
                const start = day.start ? localToInstant(key, hmToMinutes(day.start), timeZone) : dayStart(key, timeZone)
                const stop = day.end ? localToInstant(key, hmToMinutes(day.end), timeZone) : dayEnd(key, timeZone)
                raw.push([Math.max(start, from), Math.min(stop, end)])
            }
        }
    }
    return mergeIntervals(raw)
}

/**
 * Horas restantes do trabalho (estimadas − apontadas, mínimo 0) que ocupam o expediente até `dueEnd`:
 * prazo até D (ou atrasado) = todas; prazo depois de D = a parte proporcional ao expediente entre
 * hoje e D dentro do período do trabalho. Sem prazo, nada.
 */
export function workOccupationMinutes(work: ConflictWork, input: Pick<DeadlineConflictInput, "now" | "timeZone" | "availabilities">, dueDate: string): number {
    const remaining = Math.max(0, (work.estimatedMinutes ?? 0) - (work.loggedMinutes ?? 0))
    if (!remaining || !work.dueDate) return 0
    if (work.dueDate <= dueDate) return remaining
    const start = Math.max(input.now, dayStart(work.startKey, input.timeZone))
    const workEnd = dayEnd(work.dueDate, input.timeZone)
    const limit = dayEnd(dueDate, input.timeZone)
    if (limit <= start) return 0
    const period = availabilityIntervals(input.availabilities, start, work.dueDate, input.timeZone)
    // Prazo além do horizonte: o expediente do período inteiro é estimado pelo do horizonte, na proporção do tempo corrido.
    const capEnd = dayEnd(addDaysToKey(dayKeyOf(start, input.timeZone), CONFLICT_HORIZON_DAYS), input.timeZone)
    const total = workEnd > capEnd ? (intervalsMinutes(period) * (workEnd - start)) / (capEnd - start) : intervalsMinutes(period)
    // Sem expediente no período, a proporção usa o tempo corrido.
    if (!total) return Math.round((remaining * (limit - start)) / (workEnd - start))
    return Math.round((remaining * minutesBetween(period, start, limit)) / total)
}

/** Sobreposição de intervalos de dias (inclusivos). */
const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart <= bEnd && bStart <= aEnd

export function deadlineConflict(input: DeadlineConflictInput): DeadlineConflict {
    const dueDate = input.dueDate
    if (!dueDate) return { level: "none", dueDate: null, overlap: [], capacity: null }
    const today = dayKeyOf(input.now, input.timeZone)
    const startKey = input.startKey && input.startKey < today ? input.startKey : today
    const from = startKey <= dueDate ? startKey : dueDate
    const others = input.works.filter((work) => work.id !== input.selfWorkId)
    const overlap = others
        .filter((work) => work.dueDate && overlaps(from, dueDate, work.startKey, work.dueDate))
        .map((work) => ({ id: work.id, businessId: work.businessId, code: work.code, title: work.title, startKey: work.startKey, dueDate: work.dueDate! }))
    let capacity: ConflictCapacity | null = null
    const required = Math.max(0, Math.round(input.estimatedMinutes ?? 0))
    // Prazo além do horizonte: sem capacidade calculável (só a sobreposição).
    if (required > 0 && dueDate <= addDaysToKey(today, CONFLICT_HORIZON_DAYS)) {
        const intervals = availabilityIntervals(input.availabilities, input.now, dueDate, input.timeZone)
        const availableMinutes = Math.round(intervalsMinutes(intervals))
        const worksMinutes = others.reduce((sum, work) => sum + workOccupationMinutes(work, input, dueDate), 0)
        const busyMinutes = Math.round(intervalsMinutes(intersectIntervals(intervals, input.busy)))
        const occupiedMinutes = worksMinutes + busyMinutes
        const freeMinutes = Math.max(0, availableMinutes - occupiedMinutes)
        capacity = { requiredMinutes: required, availableMinutes, worksMinutes, busyMinutes, occupiedMinutes, freeMinutes, noAvailability: !hasAvailability(input.availabilities), insufficient: required > freeMinutes }
    }
    const level: ConflictLevel = capacity?.insufficient ? "strong" : overlap.length ? "info" : "none"
    return { level, dueDate, overlap, capacity }
}
