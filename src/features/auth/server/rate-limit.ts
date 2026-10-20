import { DomainError } from "@/lib/api/route"

const entries = new Map<string, { count: number; expires: number }>()
/** Limitador local por processo. Não confia em X-Forwarded-For enviado pelo navegador. */
export function checkRateLimit(key: string, now = Date.now(), max = 10) {
    if (entries.size > 10000) for (const [id, value] of entries) if (value.expires <= now) entries.delete(id)
    const entry = entries.get(key)
    if (!entry && entries.size > 10000) throw new DomainError(429, "Muitas tentativas. Aguarde e tente novamente.", "RATE_LIMITED")
    if (!entry || entry.expires <= now) { entries.set(key, { count: 1, expires: now + 15 * 60_000 }); return }
    if (entry.count >= max) throw new DomainError(429, "Muitas tentativas. Aguarde e tente novamente.", "RATE_LIMITED")
    entry.count++
}
