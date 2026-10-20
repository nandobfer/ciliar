import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server-core"

vi.mock("@/lib/db", async (original) => ({ ...(await original<object>()), dbConnect: vi.fn(async () => undefined) }))
vi.mock("ai", () => ({ dynamicTool: (def: unknown) => def }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined), integrationChannel: (id: string) => `private-integration-${id}` }))
const storage = vi.hoisted(() => ({ copyFile: vi.fn(async () => undefined), deleteFile: vi.fn(async () => undefined) }))
vi.mock("@/lib/storage/s3", async (original) => ({ ...(await original<object>()), ...storage }))
const runner = vi.hoisted(() => ({ assertInterviewerAvailable: vi.fn(async () => ({})), startOpeningTurn: vi.fn(async () => undefined) }))
vi.mock("@/features/businesses/server/interview/runner", () => runner)

import { accessModels } from "@/features/access/server/models"
import { createRole } from "@/features/access/server/commands"
import { resolveAccess } from "@/features/access/server/access"
import type { AccessContext } from "@/features/access/server/context"
import { businessModels } from "@/features/businesses/server/models"
import { archiveBusiness, deleteBusiness, getBusinessDetail, listBusinesses, purgeArchivedBusinesses, restoreBusiness, updateBusiness } from "@/features/businesses/server/businesses"
import { onboardingState } from "@/features/businesses/server/onboarding"
import { currentInterviewScript, saveInterviewScript } from "@/features/businesses/server/interviewer-settings"
import { businessInterviewTranscript, discardInterview, startInterview } from "@/features/businesses/server/interview/sessions"
import { buildInterviewTools } from "@/features/businesses/server/interview/tools"
import { scopeOf } from "@/features/businesses/server/interview/state"
import { DEFAULT_INTERVIEW_QUESTIONS, type BusinessField } from "@/features/businesses/constants"
import { findOpexTool } from "@/features/opex-agent/server/tools/registry"
import { requestAccess } from "@/features/access/server/context"

/** Negócios e entrevista contra os serviços reais (MongoMemoryReplSet efêmero; nunca o banco real). */

let replica: MongoMemoryReplSet
let admin: AccessContext
const access = accessModels()
const business = businessModels()

const role = (nome: string, permissoes: string[], limiteNegocios: number | null = null) => createRole(admin, { nome, descricao: "", cor: "azul", ativo: true, permissoes, limiteNegocios })
async function user(name: string, roles: string[]) {
    const created = await access.users.create({ name, email: `${name.toLowerCase()}@example.test`, active: true, roles })
    return resolveAccess(created.id as string)
}
const viewAsUser = (userId: string) => Buffer.from(JSON.stringify({ tipo: "usuario", userId })).toString("base64url")

type Exec = { execute: (input: unknown) => Promise<Record<string, unknown>> }
function tools(context: AccessContext, interviewId: string, fields: BusinessField[] = DEFAULT_INTERVIEW_QUESTIONS.filter((question) => question.active).map((question) => question.field)) {
    const set = buildInterviewTools(fields, { interviewId, scope: scopeOf(context) }) as unknown as Record<string, Exec>
    return (name: string, input: unknown) => set[name]!.execute(input)
}

/** Responde o roteiro padrão inteiro (logo pulada). */
async function answerAll(call: ReturnType<typeof tools>, name = "Studio Aurora") {
    await call("set_name", { name })
    await call("set_type", { type: "PJ" })
    await call("set_subtype", { subtype: "MEI" })
    await call("set_segment", { segment: "Fotografia" })
    await call("skip_question", { field: "logo" })
    await call("set_links", { links: ["studioaurora.com.br"] })
    await call("set_availability", { days: [{ weekday: 1, start: "09:00", end: "18:00" }, { weekday: 3 }] })
    return call("set_goals", { goals: [{ targetCents: 500000, period: "month", mode: "recurring" }, { targetCents: 15000, period: "hour", measure: "range", from: "2027-01-01", to: "2027-06-30" }] })
}

beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.18" }, replSet: { count: 1 }, instanceOpts: [{ ip: "127.0.0.1" }] })
    await mongoose.connect(replica.getUri("ciliar_businesses_test"))
    await Promise.all([...Object.values(access), ...Object.values(business)].map((model) => model.init()))
}, 120_000)
beforeEach(async () => {
    vi.clearAllMocks()
    await Promise.all([...Object.values(access), ...Object.values(business)].map((model) => model.deleteMany({})))
    const adminRole = await access.roles.create({ slug: "admin", nome: "Administrador", permissoes: ["*"], ativo: true })
    const created = await access.users.create({ name: "Admin", email: "admin@example.test", active: true, roles: [adminRole.id] })
    admin = await resolveAccess(created.id as string)
})
afterAll(async () => {
    await mongoose.disconnect()
    await replica?.stop()
})

describe("entrevista e criação do negócio", () => {
    it("onboarding obrigatório, validação por campo, pular só opcional e criação direta ao responder a última", async () => {
        const provider = (await role("Prestador", ["businesses.use"], 1)).id
        const ana = await user("Ana", [provider])
        expect(await onboardingState(ana)).toMatchObject({ required: true, interviewId: null })
        expect(await onboardingState(admin)).toMatchObject({ required: false })

        const progress = await startInterview(ana)
        expect(progress.questions.map((question) => question.field)).toEqual(["name", "type", "segment", "logo", "links", "availability", "goals"])
        expect(progress.canDiscard).toBe(false)
        expect(runner.startOpeningTurn).toHaveBeenCalledOnce()
        expect((await startInterview(ana)).id).toBe(progress.id) // uma em andamento por dono

        const call = tools(ana, progress.id)
        await expect(call("skip_question", { field: "name" })).rejects.toThrow(/obrigatória/)
        await expect(call("set_name", { name: "   " })).rejects.toThrow(/Informe o nome/)
        await expect(call("set_links", { links: ["http://"] })).rejects.toThrow(/URL inválida/)
        await expect(call("set_availability", { days: [{ weekday: 1, start: "18:00", end: "09:00" }] })).rejects.toThrow(/antes do fim/)
        await expect(call("set_goals", { goals: [{ targetCents: 1000, period: "hour" }] })).rejects.toThrow(/janela de medição/)
        await expect(call("set_goals", { goals: [{ targetCents: 1000, period: "month", mode: "specific" }] })).rejects.toThrow(/AAAA-MM/)
        await call("set_name", { name: "Nome errado" })
        const result = await answerAll(call)
        expect(result).toMatchObject({ completed: true, businessName: "Studio Aurora" })

        const interview = await business.interviews.findById(progress.id).lean().orFail()
        expect(interview.status).toBe("completed")
        const detail = await getBusinessDetail(ana, interview.businessId!)
        expect(detail).toMatchObject({ name: "Studio Aurora", number: 1, type: "PJ", subtype: "MEI", segment: "Fotografia", links: ["https://studioaurora.com.br"], currency: "BRL", status: "active", logo: null })
        expect(detail.availability).toEqual([{ weekday: 1, start: "09:00", end: "18:00" }, { weekday: 3, start: null, end: null }])
        expect(detail.goals).toEqual([
            expect.objectContaining({ period: "month", mode: "recurring", targetCents: 500000, month: null }),
            expect.objectContaining({ period: "hour", measure: "range", mode: null, from: "2027-01-01", to: "2027-06-30" }),
        ])
        expect(await onboardingState(ana)).toMatchObject({ required: false })
        expect(await access.audits.countDocuments({ action: "business.create", actorId: ana.userId })).toBe(1)
        const transcript = await businessInterviewTranscript(ana, detail.id)
        expect(transcript.interview.questions.find((question) => question.field === "logo")?.status).toBe("skipped")

        // Limite 1: um segundo negócio só depois de arquivar.
        await expect(startInterview(ana)).rejects.toMatchObject({ code: "BUSINESS_LIMIT_REACHED" })
    })

    it("o roteiro é versionado e a entrevista segue a versão com que começou; nome pulado vira \"Negócio N\"", async () => {
        const provider = (await role("Prestador", ["businesses.use"])).id
        const bia = await user("Bia", [provider])
        expect((await currentInterviewScript()).version).toBe(0)
        const questions = [
            { field: "name" as const, prompt: "Nome?", required: false, active: true },
            { field: "type" as const, prompt: "PF ou PJ?", required: true, active: true },
        ]
        const saved = await saveInterviewScript(admin, { questions, notes: "curto", version: 0 })
        expect(saved.script.version).toBe(1)
        await expect(saveInterviewScript(admin, { questions, version: 0 })).rejects.toMatchObject({ code: "VERSION_CONFLICT" })
        await expect(saveInterviewScript(admin, { questions: [...questions, questions[0]], version: 1 })).rejects.toMatchObject({ status: 400 })
        await expect(saveInterviewScript(bia, { questions, version: 1 })).rejects.toMatchObject({ status: 403 })
        expect(await access.audits.countDocuments({ action: "interview_script.update" })).toBe(1)

        const progress = await startInterview(bia)
        expect(progress.scriptVersion).toBe(1)
        await saveInterviewScript(admin, { questions: [{ field: "segment", prompt: "Área?", required: true, active: true }], version: 1 })
        const call = tools(bia, progress.id, ["name", "type"])
        await call("skip_question", { field: "name" })
        expect(await call("set_type", { type: "PF" })).toMatchObject({ completed: true, businessName: "Negócio 1" })
    })

    it("descartar só com outro negócio ativo", async () => {
        const provider = (await role("Prestador", ["businesses.use"])).id
        const caio = await user("Caio", [provider])
        const first = await startInterview(caio)
        await expect(discardInterview(first.id, caio)).rejects.toMatchObject({ code: "INTERVIEW_REQUIRED" })
        await answerAll(tools(caio, first.id))
        const second = await startInterview(caio)
        expect(second.canDiscard).toBe(true)
        await discardInterview(second.id, caio)
        expect(await business.interviews.exists({ _id: second.id })).toBeNull()
        expect(await access.audits.countDocuments({ action: "interview.discard" })).toBe(1)
    })
})

describe("negócios: limite, arquivamento, isolamento e suporte", () => {
    it("vale o maior limite; arquivados não contam e restaurar exige vaga (também em concorrência)", async () => {
        const one = (await role("Um", ["businesses.use"], 1)).id
        const two = (await role("Dois", ["businesses.use"], 2)).id
        const dani = await user("Dani", [one, two])
        expect((await listBusinesses(dani)).capacity).toMatchObject({ limit: 2, active: 0, canCreate: true })
        const unlimited = (await role("Livre", ["admin.access"])).id
        expect((await listBusinesses(await user("Edu", [one, unlimited]))).capacity.limit).toBeNull()

        const eva = await user("Eva", [one])
        const progress = await startInterview(eva)
        await answerAll(tools(eva, progress.id))
        const [created] = (await listBusinesses(eva)).items
        const archived = await archiveBusiness(eva, created!.id)
        expect(archived).toMatchObject({ status: "archived" })
        expect(archived.purgeAt).not.toBeNull()
        expect((await listBusinesses(eva)).capacity).toMatchObject({ active: 0, archived: 1, canCreate: true })
        // Dois arquivados disputando a única vaga: só um volta.
        await business.businesses.create({ ownerId: eva.userId, number: 9, name: "Outro", status: "archived", archivedAt: new Date(), createdBy: eva.userId, updatedBy: eva.userId })
        const other = (await listBusinesses(eva, { status: "archived" })).items.find((item) => item.name === "Outro")!
        const results = await Promise.allSettled([restoreBusiness(eva, created!.id), restoreBusiness(eva, other.id)])
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
        expect(results.some((result) => result.status === "rejected" && (result.reason as { code?: string }).code === "BUSINESS_LIMIT_REACHED")).toBe(true)
        expect((await listBusinesses(eva)).capacity.active).toBe(1)
    })

    it("só o dono altera; suporte lê (auditado) e nunca altera; excluir exige arquivado", async () => {
        const provider = (await role("Prestador", ["businesses.use"])).id
        const support = (await role("Suporte", ["businesses.view_all"])).id
        const fabi = await user("Fabi", [provider])
        const gil = await user("Gil", [provider])
        const helpdesk = await user("Help", [support])
        const progress = await startInterview(fabi)
        await answerAll(tools(fabi, progress.id))
        const [own] = (await listBusinesses(fabi)).items
        await expect(getBusinessDetail(gil, own!.id)).rejects.toMatchObject({ status: 404 })
        await expect(updateBusiness(gil, own!.id, { name: "Invadido", version: 0 })).rejects.toMatchObject({ status: 404 })

        const read = await getBusinessDetail(helpdesk, own!.id)
        expect(read).toMatchObject({ name: "Studio Aurora", editable: false, ownerName: "Fabi" })
        expect(await access.audits.countDocuments({ action: "business.support_view", actorId: helpdesk.userId })).toBe(1)
        expect((await listBusinesses(helpdesk, { ownerId: fabi.userId })).items).toHaveLength(1)
        await expect(listBusinesses(gil, { ownerId: fabi.userId })).rejects.toMatchObject({ status: 403 })
        await expect(archiveBusiness(helpdesk, own!.id)).rejects.toMatchObject({ status: 403 })

        const updated = await updateBusiness(fabi, own!.id, { name: "", segment: "Vídeo", version: 0 })
        expect(updated).toMatchObject({ name: "Negócio 1", segment: "Vídeo", version: 1 })
        await expect(updateBusiness(fabi, own!.id, { name: "X", version: 0 })).rejects.toMatchObject({ code: "VERSION_CONFLICT" })
        await expect(deleteBusiness(fabi, own!.id)).rejects.toMatchObject({ code: "BUSINESS_NOT_ARCHIVED" })
        await archiveBusiness(fabi, own!.id)
        await deleteBusiness(fabi, own!.id)
        expect(await business.businesses.exists({ _id: own!.id })).toBeNull()
        expect(await business.interviews.exists({ businessId: own!.id })).toBeNull()
        expect(await business.goals.countDocuments({ businessId: own!.id })).toBe(0)
    })

    it("simulação de usuário: onboarding do alvo, dono = alvo e auditoria com o ator real", async () => {
        const provider = (await role("Prestador", ["businesses.use"])).id
        const ivo = await user("Ivo", [provider])
        const simulated = await resolveAccess(admin.userId, viewAsUser(ivo.userId))
        expect(await onboardingState(simulated)).toMatchObject({ required: true })
        const progress = await startInterview(simulated)
        await answerAll(tools(simulated, progress.id))
        const [created] = (await listBusinesses(ivo)).items
        expect(created).toMatchObject({ ownerId: ivo.userId })
        expect(await business.businesses.countDocuments({ ownerId: admin.userId })).toBe(0)
        await archiveBusiness(simulated, created!.id)
        const audit = await access.audits.findOne({ action: "business.archive" }).lean().orFail()
        expect(audit.actorId).toBe(admin.userId)
        expect(audit.simulation).toMatchObject({ tipo: "usuario", alvoId: ivo.userId })
    })

    it("ferramentas do Agente Opex chamam os serviços reais com o acesso do usuário", async () => {
        const provider = (await role("Prestador", ["businesses.use", "opex.use"])).id
        const kai = await user("Kai", [provider])
        const progress = await startInterview(kai)
        await answerAll(tools(kai, progress.id))
        const run = (name: string, raw: unknown) => {
            const tool = findOpexTool(name)!
            const input = tool.input.parse(raw)
            return requestAccess.run(kai, () => tool.execute(input, { sessionId: "s".repeat(24), actorId: kai.userId, scope: scopeOf(kai), access: kai })) as Promise<Record<string, unknown>>
        }
        const list = (await run("list_businesses", {})) as { items: { id: string }[]; capacity: unknown }
        const id = list.items[0]!.id
        expect(await run("update_business", { businessId: id, currency: "USD", links: ["novo.com"] })).toMatchObject({ currency: "USD", links: ["https://novo.com"] })
        expect(await run("get_business_interview", { businessId: id })).toMatchObject({ scriptVersion: 0, subtype: "MEI" })
        expect(await run("archive_business", { businessId: id })).toMatchObject({ status: "archived" })
        expect(await run("restore_business", { businessId: id })).toMatchObject({ status: "active" })
        await expect(run("delete_business", { businessId: id })).rejects.toMatchObject({ code: "BUSINESS_NOT_ARCHIVED" })
    })

    it("rotina businesses-purge exclui os arquivados depois do prazo", async () => {
        const provider = (await role("Prestador", ["businesses.use"])).id
        const joa = await user("Joa", [provider])
        const old = await business.businesses.create({ ownerId: joa.userId, number: 1, name: "Antigo", status: "archived", archivedAt: new Date(Date.now() - 40 * 86_400_000), logo: { key: "businesses/x/logo/a.png", name: "a.png", mediaType: "image/png", size: 10 }, createdBy: joa.userId, updatedBy: joa.userId })
        await business.businesses.create({ ownerId: joa.userId, number: 2, name: "Recente", status: "archived", archivedAt: new Date(), createdBy: joa.userId, updatedBy: joa.userId })
        expect(await purgeArchivedBusinesses()).toMatch(/1 negócio/)
        expect(await business.businesses.exists({ _id: old._id })).toBeNull()
        expect(await business.businesses.countDocuments({ ownerId: joa.userId })).toBe(1)
        expect(storage.deleteFile).toHaveBeenCalledWith("businesses/x/logo/a.png")
        expect(await access.audits.countDocuments({ action: "business.purge", actorId: "system:businesses-purge" })).toBe(1)
    })
})
