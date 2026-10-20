import { hash, verify } from "@node-rs/argon2"

// Argon2id = 2; o pacote exporta const enum ambiente, incompatível com isolatedModules do Next.
const options = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 }
export const hashPassword = (password: string) => hash(password, options)
export async function verifyPassword(hashed: string, password: string) {
    try { return await verify(hashed, password) } catch { return false }
}
let dummyHash: Promise<string> | undefined
export const getDummyHash = () => dummyHash ??= hashPassword("not-a-real-account-password")
