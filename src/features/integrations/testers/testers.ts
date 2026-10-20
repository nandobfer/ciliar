import { getIntegrationConfig } from "@/lib/integrations/config"
import { type IntegrationId } from "@/lib/integrations/catalog"
import { describeSchedule } from "@/lib/integrations/schedule"
import { CronJobState } from "@/lib/db/models/CronJobState"
import { ApiToken } from "@/lib/db/models/ApiToken"
import { dbConnect } from "@/lib/db"
import { getRawPusherServer } from "@/lib/pusher/server"
import { buildPublicApiSpec } from "@/features/public-api/openapi/spec"
import { testAiHub, testAnthropic, testDeepseek, testGemini, testJev, testOpenai, testOpencode } from "@/features/ai/server/testers"
import { verifyConnection } from "@/lib/email/mailer"
import { checkBucket } from "@/lib/storage/s3"
import { signupAvailability } from "@/features/platform/server/settings"
import { describeFetchError, fail, type IntegrationTester } from "./types"

// ---------------------------------------------------------------------------
// Pusher: GET /channels
// ---------------------------------------------------------------------------

const testPusher: IntegrationTester = async ({ emit }) => {
    const pusherConfig = await getIntegrationConfig("pusher")
    const target = pusherConfig.mode === "host" ? `host próprio ${pusherConfig.url ?? ""}`.trim() : `cluster ${pusherConfig.cluster}`
    emit("step", `Autenticando na API REST do Pusher (GET /channels, ${target})`)
    let client: Awaited<ReturnType<typeof getRawPusherServer>>
    try {
        client = await getRawPusherServer()
    } catch (error) {
        fail(describeFetchError(error))
    }
    const res = await client.get({ path: "/channels" }).catch((error: unknown) => fail(`Pusher recusou: ${describeFetchError(error)}`))
    if (!res.ok) fail(`Pusher respondeu HTTP ${res.status}`)
    const body = (await res.json().catch(() => ({}))) as { channels?: Record<string, unknown> }
    const count = Object.keys(body.channels ?? {}).length
    emit("success", `Pusher respondeu HTTP ${res.status}; ${count} canal(is) ocupado(s)`)
    return "Credenciais do Pusher válidas"
}

// ---------------------------------------------------------------------------
// API interna: especificação pública + tokens de sistema ativos
// ---------------------------------------------------------------------------

const testInternalApi: IntegrationTester = async ({ emit }) => {
    emit("step", "Gerando e validando a especificação administrativa da API interna")
    const spec = buildPublicApiSpec() as { openapi?: string; paths?: Record<string, unknown> }
    if (!spec?.openapi?.startsWith("3.")) fail("A resposta não é uma especificação OpenAPI 3.x")
    emit("success", `Especificação OpenAPI ${spec.openapi} com ${Object.keys(spec.paths ?? {}).length} caminho(s)`)

    await dbConnect()
    const tokens = await ApiToken.countDocuments({ revogadoEm: null })
    emit(tokens > 0 ? "success" : "info", tokens > 0 ? `${tokens} token(s) de sistema ativo(s)` : "Nenhum token de sistema ativo: os endpoints públicos recusarão toda chamada")
    return "API interna documentada e protegida por token"
}

// ---------------------------------------------------------------------------
// Crons: segredo + estado do agendador
// ---------------------------------------------------------------------------

const testCrons: IntegrationTester = async ({ emit }) => {
    const config = await getIntegrationConfig("crons")
    if (!config.cronSecret) fail("Cron secret não configurado: as rotas /api/routines/* recusarão toda chamada")
    emit("success", "Cron secret configurado")
    emit("info", "Disparo: tick interno (processo persistente)")

    if (!config.schedulerEnabled) {
        emit("warn", "Agendador desligado: nenhuma rotina será disparada")
    } else {
        emit("success", "Agendador ativo")
    }

    await dbConnect()
    const states = await CronJobState.find({}).lean()
    const byId = new Map(states.map((state) => [state.jobId, state]))
    let failures = 0
    for (const job of config.jobs) {
        const state = byId.get(job.id)
        const next = state?.nextRunAt ? new Date(state.nextRunAt).toISOString() : "ainda não agendada"
        const status = state?.lastStatus === "error" ? "erro na última execução" : state?.lastStatus === "ok" ? "última execução OK" : "sem execuções"
        if (state?.lastStatus === "error") failures++
        emit(
            !job.enabled ? "info" : state?.lastStatus === "error" ? "warn" : "info",
            `• ${job.label}: ${job.enabled ? describeSchedule(job.schedule) : "desativada"} — ${status}; próxima: ${next}`,
        )
    }
    if (!config.schedulerEnabled) fail("Agendador desligado")
    return failures > 0 ? `Agendador ativo; ${failures} rotina(s) com erro na última execução` : "Agendador ativo e rotinas em dia"
}

// ---------------------------------------------------------------------------
// SMTP: transporter.verify()
// ---------------------------------------------------------------------------

const testSmtp: IntegrationTester = async ({ emit }) => {
    const config = await getIntegrationConfig("smtp")
    if (!config.host) fail("Host SMTP não configurado (envios estão em modo simulado)")
    emit("step", `Conectando em ${config.host}:${config.port}${config.port === 465 ? " (TLS)" : ""}`)
    try {
        await verifyConnection()
    } catch (error) {
        fail(`Servidor SMTP recusou: ${describeFetchError(error)}`)
    }
    emit("success", "Servidor SMTP aceitou a conexão e a autenticação")
    return "SMTP pronto para enviar e-mails"
}

// ---------------------------------------------------------------------------
// Storage S3: HeadBucket
// ---------------------------------------------------------------------------

const testStorage: IntegrationTester = async ({ emit }) => {
    const config = await getIntegrationConfig("storage_s3")
    if (!config.endpoint || !config.accessKey || !config.secretKey) fail("Endpoint ou credenciais do Storage não configurados")
    emit("step", `Verificando o bucket "${config.bucket}" em ${config.endpoint}`)
    try {
        await checkBucket()
    } catch (error) {
        fail(`Bucket inacessível: ${describeFetchError(error)}`)
    }
    emit("success", `Bucket "${config.bucket}" acessível`)
    return "Storage S3 acessível"
}

// ---------------------------------------------------------------------------
// Plataforma: perfil padrão válido + termos publicados (cadastro público)
// ---------------------------------------------------------------------------

const testPlatform: IntegrationTester = async ({ emit }) => {
    await dbConnect()
    emit("step", "Conferindo o perfil padrão e a versão vigente dos termos")
    const signup = await signupAvailability()
    emit(signup.defaultRoleId ? "success" : "warn", signup.defaultRoleId ? "Perfil padrão configurado" : "Nenhum perfil padrão configurado")
    emit(signup.legalVersion > 0 ? "success" : "warn", signup.legalVersion > 0 ? `Termos e política publicados (versão ${signup.legalVersion})` : "Termos e política ainda não publicados")
    if (!signup.available) fail(signup.message ?? "Cadastro público indisponível")
    return "Cadastro público disponível"
}

export const INTEGRATION_TESTERS: Record<IntegrationId, IntegrationTester> = {
    pusher: testPusher,
    internal_api: testInternalApi,
    crons: testCrons,
    ai: testAiHub,
    ai_opencode: testOpencode,
    ai_gemini: testGemini,
    ai_anthropic: testAnthropic,
    ai_openai: testOpenai,
    ai_deepseek: testDeepseek,
    ai_jev: testJev,
    smtp: testSmtp,
    storage_s3: testStorage,
    platform: testPlatform,
}
