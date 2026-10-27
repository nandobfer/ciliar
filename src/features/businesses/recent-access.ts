import { differenceInCalendarDays, format } from "date-fns"
import { ptBR } from "date-fns/locale"

/**
 * Seletor de negócio do cabeçalho (módulo PURO), copiado de
 * `~/code/sipal/crm-marketing-campanhas/src/features/companies/utils/company-hub.ts`: ordem pelo
 * último acesso do usuário real, busca sem acento nem maiúsculas e o texto do acesso.
 */

interface Accessed {
    name: string
    lastAccessedAt?: string | null
}

const normalize = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()

/** Busca por trecho do nome, sem diferenciar acento nem maiúsculas ("cafe" → "Café"). */
export function searchBusinesses<T extends Pick<Accessed, "name">>(businesses: readonly T[], term: string): T[] {
    const query = normalize(term)
    if (!query) return [...businesses]
    return businesses.filter((business) => normalize(business.name).includes(query))
}

/** Mais recente primeiro; os nunca acessados vão para o fim, em ordem alfabética. */
export function sortByRecentAccess<T extends Accessed>(businesses: readonly T[]): T[] {
    return [...businesses].sort((a, b) => {
        if (a.lastAccessedAt && b.lastAccessedAt) return b.lastAccessedAt.localeCompare(a.lastAccessedAt)
        if (a.lastAccessedAt) return -1
        if (b.lastAccessedAt) return 1
        return a.name.localeCompare(b.name, "pt-BR")
    })
}

/** "hoje, 10:05", "ontem, 17:40", "28 set" ou "28 set 2025" (outro ano). */
export function formatAccessTime(iso: string, now: Date = new Date()): string {
    const date = new Date(iso)
    const days = differenceInCalendarDays(now, date)
    if (days === 0) return `hoje, ${format(date, "HH:mm")}`
    if (days === 1) return `ontem, ${format(date, "HH:mm")}`
    const pattern = date.getFullYear() === now.getFullYear() ? "d MMM" : "d MMM yyyy"
    return format(date, pattern, { locale: ptBR }).replace(".", "")
}
