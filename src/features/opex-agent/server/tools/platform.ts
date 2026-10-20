import { z } from "zod"
import { dbConnect } from "@/lib/db"
import { objectId } from "@/features/access/schemas"
import { DOCUMENT_TYPE_CATEGORIES, LEGAL_TEXT_MAX, RETENTION_TYPES, type RetentionType } from "@/features/platform/constants"
import { getCurrentLegal, getLegalOverview, getLegalVersion, publishLegalVersion } from "@/features/platform/server/legal"
import { getPlatformSettings, updatePlatformSettings } from "@/features/platform/server/settings"
import { defineTool, OpexToolError } from "./define"

const retentionPatch = z
    .object(Object.fromEntries(RETENTION_TYPES.map((type) => [type, z.number().int().optional()])) as Record<RetentionType, z.ZodOptional<z.ZodNumber>>)
    .partial()
    .describe(`Dias até a exclusão definitiva por tipo (${RETENTION_TYPES.join(", ")}); só os informados mudam`)

export const platformTools = [
    defineTool("get_platform_settings", {
        input: z.object({}),
        execute: async (_input, { access }) => {
            await dbConnect()
            const dto = await getPlatformSettings(access)
            const defaultRole = dto.roleOptions.find((role) => role.id === dto.settings.defaultRoleId)
            return {
                defaultRole: dto.settings.defaultRoleId ? { id: dto.settings.defaultRoleId, name: defaultRole?.nome ?? null } : null,
                publicSignup: { available: dto.signup.available, reason: dto.signup.message },
                retentionDays: dto.settings.retentionDays,
                documents: dto.settings.documents,
                legalVersion: dto.legalVersion,
                roleOptions: dto.roleOptions.map((role) => ({ id: role.id, name: role.nome, active: role.ativo, eligible: !role.bloqueado, reason: role.motivo ?? null })),
            }
        },
    }),
    defineTool("update_platform_settings", {
        input: z.object({
            defaultRoleId: objectId.nullable().optional().describe("Perfil padrão do cadastro público (id de get_platform_settings); null desativa o cadastro público"),
            retentionDays: retentionPatch.optional(),
            maxFileSizeMb: z.number().int().optional().describe("Tamanho máximo por documento/anexo, em MB"),
            allowedTypes: z.array(z.enum(DOCUMENT_TYPE_CATEGORIES)).optional().describe("Lista COMPLETA de tipos aceitos (substitui a atual)"),
        }),
        summarize: (input) => {
            const parts = [
                input.defaultRoleId === undefined ? null : input.defaultRoleId === null ? "desativar o cadastro público (sem perfil padrão)" : `perfil padrão para ${input.defaultRoleId}`,
                input.retentionDays ? `prazos de exclusão (${Object.keys(input.retentionDays).join(", ")})` : null,
                input.maxFileSizeMb === undefined ? null : `tamanho máximo para ${input.maxFileSizeMb} MB`,
                input.allowedTypes ? `tipos permitidos (${input.allowedTypes.join(", ")})` : null,
            ].filter(Boolean)
            return `Alterar a configuração da plataforma: ${parts.join("; ") || "nada"}`
        },
        execute: async (input, { access }) => {
            if (input.defaultRoleId === undefined && !input.retentionDays && input.maxFileSizeMb === undefined && !input.allowedTypes) {
                throw new OpexToolError("Nada para alterar: informe defaultRoleId, retentionDays, maxFileSizeMb ou allowedTypes.")
            }
            await dbConnect()
            const current = await getPlatformSettings(access)
            const retention = Object.fromEntries(Object.entries(input.retentionDays ?? {}).filter(([, value]) => value !== undefined))
            const saved = await updatePlatformSettings(access, {
                defaultRoleId: input.defaultRoleId === undefined ? current.settings.defaultRoleId : input.defaultRoleId,
                retentionDays: { ...current.settings.retentionDays, ...retention },
                documents: {
                    maxFileSizeMb: input.maxFileSizeMb ?? current.settings.documents.maxFileSizeMb,
                    allowedTypes: input.allowedTypes ?? current.settings.documents.allowedTypes,
                },
                version: current.version,
            })
            return { ok: true, settings: saved.settings, publicSignup: { available: saved.signup.available, reason: saved.signup.message } }
        },
    }),
    defineTool("get_legal_terms", {
        input: z.object({
            version: z.number().int().positive().optional().describe("Versão específica; omitida, devolve a vigente"),
            includeText: z.boolean().default(true).describe("Incluir os textos completos (markdown)"),
        }),
        execute: async ({ version, includeText }) => {
            await dbConnect()
            const overview = await getLegalOverview()
            const selected = version ? await getLegalVersion(version) : await getCurrentLegal()
            if (version && !selected) throw new OpexToolError(`Versão ${version} não encontrada.`)
            const document = selected
                ? {
                      version: selected.version,
                      publishedAt: selected.publishedAt,
                      publishedBy: selected.publishedByName,
                      notes: selected.notes,
                      ...(includeText ? { termsOfUse: selected.termsOfUse, privacyPolicy: selected.privacyPolicy } : {}),
                  }
                : null
            return {
                currentVersion: overview.current?.version ?? null,
                document,
                history: overview.history.map((item) => ({ version: item.version, publishedAt: item.publishedAt, publishedBy: item.publishedByName, notes: item.notes })),
            }
        },
    }),
    defineTool("update_legal_terms", {
        input: z.object({
            termsOfUse: z.string().trim().min(1).max(LEGAL_TEXT_MAX).optional().describe("Novo texto completo dos termos de uso (markdown); omitido, mantém o vigente"),
            privacyPolicy: z.string().trim().min(1).max(LEGAL_TEXT_MAX).optional().describe("Novo texto completo da política de privacidade (markdown); omitido, mantém o vigente"),
            notes: z.string().trim().max(500).default("").describe("Resumo das mudanças"),
        }),
        summarize: (input) =>
            `Publicar nova versão ${[input.termsOfUse ? "dos termos de uso" : null, input.privacyPolicy ? "da política de privacidade" : null].filter(Boolean).join(" e ") || "dos termos"} — todos os usuários deverão aceitá-la no próximo acesso`,
        execute: async (input, { access }) => {
            if (!input.termsOfUse && !input.privacyPolicy) throw new OpexToolError("Informe termsOfUse e/ou privacyPolicy.")
            await dbConnect()
            const current = await getCurrentLegal()
            const termsOfUse = input.termsOfUse ?? current?.termsOfUse
            const privacyPolicy = input.privacyPolicy ?? current?.privacyPolicy
            if (!termsOfUse || !privacyPolicy) throw new OpexToolError("Ainda não há versão publicada: informe os dois textos (termsOfUse e privacyPolicy).")
            if (current && termsOfUse === current.termsOfUse && privacyPolicy === current.privacyPolicy) throw new OpexToolError("Os textos são iguais aos da versão vigente.")
            const { version } = await publishLegalVersion(access, { termsOfUse, privacyPolicy, notes: input.notes })
            return { ok: true, version, previousVersion: current?.version ?? null, notice: "Todos os usuários (inclusive você) precisarão aceitar a nova versão no próximo acesso." }
        },
    }),
]
