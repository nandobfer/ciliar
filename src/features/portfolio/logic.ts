import { PORTFOLIO_RESERVED_SLUGS, PORTFOLIO_SLUG_MAX, PORTFOLIO_SLUG_MIN, PORTFOLIO_SLUG_PATTERN } from "./constants"

/** Regras puras do portfólio (M5): slug, ordem, contato e tags. Blocos em `blocks.ts`, exibição em `resolve.ts`. */

/** Texto → slug (minúsculas, números e hífen; sem acento). Pode sair curto/vazio. */
export function slugify(text: string): string {
    return text
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, PORTFOLIO_SLUG_MAX)
        .replace(/-+$/g, "")
}

export type SlugProblem = "format" | "reserved"

/** `null` = válido; senão o motivo. */
export function slugProblem(slug: string): SlugProblem | null {
    if (slug.length < PORTFOLIO_SLUG_MIN || slug.length > PORTFOLIO_SLUG_MAX || !PORTFOLIO_SLUG_PATTERN.test(slug)) return "format"
    if (PORTFOLIO_RESERVED_SLUGS.has(slug)) return "reserved"
    return null
}

export const SLUG_PROBLEM_MESSAGES: Record<SlugProblem, string> = {
    format: `Use de ${PORTFOLIO_SLUG_MIN} a ${PORTFOLIO_SLUG_MAX} caracteres: letras minúsculas, números e hífen (sem hífen no início, no fim ou repetido).`,
    reserved: "Este endereço é reservado pela plataforma. Escolha outro.",
}

/**
 * Candidatos ao slug sugerido pelo nome do negócio: o próprio nome, depois `-2`, `-3`…; nome curto
 * ou reservado vira `negocio-<nome>`/`negocio-<número>`.
 */
export function slugCandidates(name: string, number: number, count = 30): string[] {
    let base = slugify(name)
    if (slugProblem(base)) base = slugify(`negocio-${base || number}`)
    if (slugProblem(base)) base = `negocio-${number}`
    const out = [base]
    for (let index = 2; out.length < count; index += 1) {
        const suffix = `-${index}`
        out.push(`${base.slice(0, PORTFOLIO_SLUG_MAX - suffix.length).replace(/-+$/g, "")}${suffix}`)
    }
    return out
}

/** Ordem dos itens avulsos: a salva primeiro, os novos no fim (na ordem recebida). */
export function orderedIds(order: readonly string[], ids: readonly string[]): string[] {
    const present = new Set(ids)
    const head = [...new Set(order)].filter((id) => present.has(id))
    const inHead = new Set(head)
    return [...head, ...ids.filter((id) => !inHead.has(id))]
}

export { publicFileKind } from "./resolve"

/** Link do WhatsApp para o telefone comercial (sem DDI e com 10–11 dígitos: Brasil, 55). */
export function whatsappUrl(phone: string | null | undefined): string | null {
    if (!phone) return null
    const digits = phone.replace(/\D/g, "")
    if (digits.length < 10 || digits.length > 15) return null
    const international = phone.trim().startsWith("+") || digits.length > 11 ? digits : `55${digits}`
    return `https://wa.me/${international}`
}

/** Tags: sem vazias, sem repetidas (ignorando acento/caixa), na ordem. */
export function normalizeTags(tags: readonly string[]): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of tags) {
        const tag = raw.trim().replace(/\s+/g, " ")
        const key = tag.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR")
        if (!tag || seen.has(key)) continue
        seen.add(key)
        out.push(tag)
    }
    return out
}
