import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { decryptSecret, encryptSecret, type EncryptedSecret } from "@/lib/crypto/secretBox"
import { withBasePath } from "@/lib/base-path"
import { appOrigin } from "@/features/auth/server/origin"
import { ORDER_TOKEN_PREFIX, quotePagePath } from "../constants"

/**
 * Token do link do orçamento (SOMENTE servidor): secreto, um por pedido. O banco guarda o token
 * **cifrado** (AES-256-GCM, para o prestador "Copiar link" enquanto válido) e o hash SHA-256 (busca
 * da rota pública). A comparação final é em tempo constante.
 */

export const hashQuoteToken = (token: string) => createHash("sha256").update(token).digest("hex")

export function newQuoteToken(): { token: string; tokenBox: EncryptedSecret; tokenHash: string } {
    const token = `${ORDER_TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`
    return { token, tokenBox: encryptSecret(token), tokenHash: hashQuoteToken(token) }
}

/** Formato aceito na rota pública (falha cedo, sem consultar o banco). */
export const isQuoteTokenShape = (token: string) => token.startsWith(ORDER_TOKEN_PREFIX) && /^[A-Za-z0-9_-]{20,80}$/.test(token.slice(ORDER_TOKEN_PREFIX.length))

/** Confere o token recebido com o cifrado do pedido, em tempo constante. */
export function quoteTokenMatches(received: string, box: EncryptedSecret): boolean {
    let stored: string
    try {
        stored = decryptSecret(box)
    } catch {
        return false
    }
    const a = Buffer.from(hashQuoteToken(received), "hex")
    const b = Buffer.from(hashQuoteToken(stored), "hex")
    return a.length === b.length && timingSafeEqual(a, b)
}

export const quoteUrl = (token: string) => `${appOrigin()}${withBasePath(quotePagePath(token))}`

/** URL do link a partir do token cifrado (só para quem pede "Copiar link"). */
export const quoteUrlOf = (box: EncryptedSecret) => quoteUrl(decryptSecret(box))

/** IP do cliente pelo proxy de deploy (Cloudflare `cf-connecting-ip`, depois `x-real-ip`). */
export function clientIp(request: Request): string | null {
    const value = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip")
    return value?.trim().slice(0, 64) || null
}
