import { z } from "zod"
import { INTEGRATION_IDS, getIntegrationDef, type IntegrationId } from "@/lib/integrations/catalog"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { canSeeIntegration } from "@/features/access/catalog"
import { requirePermissions } from "@/features/access/server/access"
import type { AccessContext } from "@/features/access/server/context"
import { getIntegrationDetail, INTEGRATION_AUDIT_ENTITY, IntegrationUpdateError, listIntegrationLogs, listIntegrations, updateIntegration } from "@/features/integrations/services/integration-service"
import { runIntegrationTest } from "@/features/integrations/services/integration-test-runner"
import { buildIntegrationUpdateSchema, type IntegrationUpdateInput } from "@/features/integrations/schemas/integration.schema"
import { runJobNow } from "@/features/integrations/scheduler/cron-scheduler"
import { defineTool, OpexToolError } from "./define"
import { parseJsonObject } from "./json"

const integrationId = z.enum(INTEGRATION_IDS).describe("Id da integração (de list_integrations)")
const SECRET_REDACTED = "[segredo omitido]"
const AI_PROVIDER_INTEGRATIONS = INTEGRATION_IDS.filter((id) => id.startsWith("ai_"))

/** Erros de validação/regra da integração viram mensagens para o modelo. */
async function guard<T>(run: () => Promise<T>): Promise<T> {
    try {
        return await run()
    } catch (error) {
        if (error instanceof IntegrationUpdateError) throw new OpexToolError(error.message)
        throw error
    }
}

/** Mesmas capacidades das rotas: cada ação exige a permissão da integração alvo. */
const requireIntegration = (action: "view" | "edit" | "test" | "logs") => (input: { id: IntegrationId }, access: AccessContext) => {
    requirePermissions(access, `integrations.${input.id}.${action}`)
    // O teste agregado do hub invoca todos os provedores: exige o teste de cada um (como a rota).
    if (action === "test" && input.id === "ai") requirePermissions(access, ...AI_PROVIDER_INTEGRATIONS.map((id) => `integrations.${id}.test`))
}

function fieldsOf(id: IntegrationId) {
    const def = getIntegrationDef(id)
    return {
        publicFields: def.publicFields.map((field) => ({ key: field.key, label: field.label, kind: field.kind, description: field.description ?? null, options: field.options ?? null, cardManaged: field.group === "card" })),
        secretFields: def.secretFields.map((field) => ({ key: field.key, label: field.label, description: field.description ?? null, cardManaged: field.group === "card" })),
    }
}

const updateInput = z.object({
    id: integrationId,
    publicValuesJson: z.string().optional().describe('Objeto JSON com os campos públicos a alterar (chave → valor), ex.: {"internalBaseUrl": "http://localhost:3101"}'),
    secrets: z
        .array(z.object({ key: z.string(), value: z.string().nullable().describe("null limpa o segredo") }))
        .optional()
        .describe("Segredos a gravar (nunca são lidos de volta)"),
    environment: z.enum(["interno", "externo"]).optional(),
    debugMode: z.boolean().optional(),
})

export const integrationTools = [
    defineTool("list_integrations", {
        input: z.object({}),
        execute: async (_input, { access }) => (await listIntegrations()).filter((item) => canSeeIntegration(access.effective, item.id)),
    }),
    defineTool("get_integration", {
        input: z.object({ id: integrationId }),
        authorize: requireIntegration("view"),
        execute: async ({ id }) => ({ ...(await getIntegrationDetail(id)), fields: fieldsOf(id) }),
    }),
    defineTool("update_integration", {
        input: updateInput,
        authorize: requireIntegration("edit"),
        summarize: (input) => {
            const parts = [
                input.publicValuesJson ? "campos públicos" : null,
                input.secrets?.length ? `segredos (${input.secrets.map((secret) => secret.key).join(", ")})` : null,
                input.environment ? "ambiente" : null,
                input.debugMode !== undefined ? "modo debug" : null,
            ].filter(Boolean)
            return `Alterar ${parts.join(", ") || "a configuração"} da integração ${getIntegrationDef(input.id).name}`
        },
        redact: (input) => ({ ...input, secrets: input.secrets?.map((secret) => ({ key: secret.key, value: secret.value === null ? null : SECRET_REDACTED })) }),
        execute: async (input, context) => {
            const body: IntegrationUpdateInput = {
                ...(input.environment ? { environment: input.environment } : {}),
                ...(input.debugMode !== undefined ? { debugMode: input.debugMode } : {}),
                ...(input.publicValuesJson ? { publicValues: parseJsonObject(input.publicValuesJson, "publicValuesJson") } : {}),
                ...(input.secrets?.length
                    ? { secrets: Object.fromEntries(input.secrets.map((secret) => [secret.key, secret.value === null ? { action: "clear" as const } : { action: "set" as const, value: secret.value }])) }
                    : {}),
            }
            const parsed = buildIntegrationUpdateSchema(getIntegrationDef(input.id)).parse(body)
            const detail = await guard(() => updateIntegration(input.id, parsed as IntegrationUpdateInput, context.actorId))
            return { ok: true, publicValues: detail.publicValues, secrets: detail.secrets, health: detail.health }
        },
    }),
    defineTool("test_integration", {
        input: z.object({ id: integrationId }),
        authorize: requireIntegration("test"),
        execute: async ({ id }, context) => {
            const logs: string[] = []
            const result = await runIntegrationTest(id, { source: "manual", signal: context.signal, emit: (level, message) => void logs.push(`[${level}] ${message}`) })
            return { ...result, logs: logs.slice(-40) }
        },
    }),
    defineTool("list_integration_logs", {
        input: z.object({
            id: integrationId,
            limit: z.number().int().min(1).max(200).optional().describe("Quantidade de linhas (padrão 50)"),
            search: z.string().trim().max(200).optional().describe("Trecho do texto da linha"),
        }),
        authorize: requireIntegration("logs"),
        execute: async ({ id, limit, search }) => {
            const term = search?.toLowerCase()
            const lines = await listIntegrationLogs(id, { limit: term ? 2000 : (limit ?? 50) })
            const filtered = term ? lines.filter((line) => line.message.toLowerCase().includes(term)) : lines
            return { lines: filtered.slice(-(limit ?? 50)).map((line) => ({ ts: line.ts, level: line.level, message: line.message })) }
        },
    }),
    defineTool("list_routines", {
        input: z.object({}),
        execute: async () => {
            const [config, detail] = await Promise.all([getIntegrationConfig("crons"), getIntegrationDetail("crons")])
            // O `cronSecret` (segredo) nunca sai daqui: só a agenda e o estado das rotinas.
            return { schedulerEnabled: config.schedulerEnabled, jobs: config.jobs, states: detail.cronStates ?? [] }
        },
    }),
    defineTool("run_routine", {
        input: z.object({ jobId: z.string() }),
        summarize: (input) => `Executar agora a rotina ${input.jobId}`,
        execute: async ({ jobId }, context) => {
            let result: Awaited<ReturnType<typeof runJobNow>>
            try {
                result = await runJobNow(jobId)
            } catch (error) {
                throw new OpexToolError(error instanceof Error ? error.message : String(error))
            }
            await recordAudit({
                userId: context.actorId,
                entidade: INTEGRATION_AUDIT_ENTITY,
                entidadeId: "crons",
                acao: AcaoAuditoria.ATUALIZAR,
                depois: { execucaoManual: jobId, resultado: result.ok ? "ok" : "erro", mensagem: result.message.slice(0, 500), duracaoMs: result.durationMs, via: "opex" },
            })
            return result
        },
    }),
]
