import { z } from "zod"
import { apiTokenInputSchema } from "@/features/integrations/api-tokens/schemas"
import { createApiToken, listApiTokens, revokeApiToken } from "@/features/integrations/api-tokens/service"
import { defineTool, OpexToolError } from "./define"

/**
 * Tokens de sistema da API interna. O valor de um token novo é devolvido uma única vez: o chat o
 * mostra num card com botão de copiar (`display: "api-token"` no catálogo).
 */
export const apiTokenTools = [
    defineTool("list_api_tokens", {
        input: z.object({}),
        execute: async () => ({ tokens: await listApiTokens() }),
    }),
    defineTool("create_api_token", {
        input: z.object({ name: apiTokenInputSchema.shape.nome.describe("Nome para reconhecer o token (2 a 60 caracteres)") }),
        summarize: (input) => `Gerar o token de sistema "${input.name}" da API interna`,
        execute: async ({ name }, context) => {
            const created = await createApiToken(context.actorId, { nome: name })
            return {
                ok: true,
                token: created.token,
                item: created.item,
                note: "Valor exibido uma única vez no card do chat (com botão de copiar). Não repita o valor no texto.",
            }
        },
    }),
    defineTool("revoke_api_token", {
        input: z.object({ tokenId: z.string().trim().min(1).describe("Id do token (de list_api_tokens)") }),
        summarize: (input) => `Revogar o token de sistema ${input.tokenId} da API interna`,
        execute: async ({ tokenId }, context) => {
            const tokens = await listApiTokens()
            const found = tokens.find((token) => token.id === tokenId)
            if (!found) throw new OpexToolError(`Token "${tokenId}" não encontrado entre os ativos. Use list_api_tokens.`)
            await revokeApiToken(context.actorId, tokenId)
            return { ok: true, id: found.id, name: found.nome }
        },
    }),
]
