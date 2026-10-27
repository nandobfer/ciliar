import { z } from "zod"
import { dbConnect } from "@/lib/db"
import { ACCESS_PROTOCOLS } from "@/features/auth/request-origin"
import { AUTH_METHODS, MAX_EXTRA_HOSTS } from "@/features/authentication/constants"
import { getAuthSettings, updateAuthSettings } from "@/features/authentication/server/settings"
import type { AuthSettingsDto } from "@/features/authentication/types"
import { defineTool, OpexToolError } from "./define"

const methods = z.array(z.enum(AUTH_METHODS)).min(1).describe("Métodos do protocolo: google e/ou password (e-mail e senha); ao menos um")

function slim(dto: AuthSettingsDto) {
    return {
        methods: dto.settings.methods,
        officialHost: dto.canonicalHost,
        extraHosts: dto.settings.extraHosts,
        googleConfigured: dto.googleConfigured,
        version: dto.version,
        updatedAt: dto.updatedAt,
    }
}

export const authenticationTools = [
    defineTool("get_auth_settings", {
        input: z.object({}),
        execute: async (_input, { access }) => {
            await dbConnect()
            return slim(await getAuthSettings(access))
        },
    }),
    defineTool("update_auth_settings", {
        input: z.object({
            http: methods.optional(),
            https: methods.optional(),
            extraHosts: z.array(z.string().trim().max(253)).max(MAX_EXTRA_HOSTS).optional().describe("Lista COMPLETA de endereços adicionais (substitui a atual): domínio ou IP, sem http://, porta ou caminho"),
        }),
        summarize: (input) => {
            const parts = [
                ...ACCESS_PROTOCOLS.filter((protocol) => input[protocol]).map((protocol) => `${protocol.toUpperCase()}: ${input[protocol]!.join(" + ")}`),
                input.extraHosts ? `endereços adicionais: ${input.extraHosts.join(", ") || "nenhum"}` : null,
            ].filter(Boolean)
            return `Alterar a autenticação — ${parts.join("; ") || "nada"}`
        },
        execute: async (input, { access }) => {
            if (!input.http && !input.https && !input.extraHosts) throw new OpexToolError("Nada para alterar: informe http, https ou extraHosts.")
            await dbConnect()
            const current = await getAuthSettings(access)
            const saved = await updateAuthSettings(access, {
                methods: { http: input.http ?? current.settings.methods.http, https: input.https ?? current.settings.methods.https },
                extraHosts: input.extraHosts ?? current.settings.extraHosts,
                version: current.version,
            })
            return { ok: true, ...slim(saved) }
        },
    }),
]
