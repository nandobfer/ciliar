import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server-core"

vi.mock("@/lib/db", async (original) => ({ ...(await original<object>()), dbConnect: vi.fn(async () => undefined) }))
vi.mock("ai", () => ({ dynamicTool: (def: unknown) => def }))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels: vi.fn(async () => undefined), integrationChannel: (id: string) => `private-integration-${id}` }))
vi.mock("@/lib/after-response", () => ({ runAfterResponse: vi.fn() }))
vi.mock("@/lib/email/mailer", () => ({ isMockMode: vi.fn(async () => true), sendEmail: vi.fn() }))

import { BUSINESS_FULL_PERMISSIONS } from "@/features/businesses/permissions"
import { accessModels } from "@/features/access/server/models"
import { createRole } from "@/features/access/server/commands"
import { resolveAccess } from "@/features/access/server/access"
import type { AccessContext } from "@/features/access/server/context"
import { businessModels } from "@/features/businesses/server/models"
import { createActivity } from "@/features/businesses/server/activities"
import { archiveBusiness, deleteBusiness } from "@/features/businesses/server/businesses"
import { createSuccess, deleteSuccess, archiveSuccess } from "@/features/businesses/server/successes"
import { measureGoalWindows } from "@/features/businesses/server/revenue"
import { platformModels } from "@/features/platform/server/models"
import { orderModels } from "@/features/orders/server/models"
import { createClient } from "@/features/orders/server/clients"
import { acceptOrder, createOrder, getOrder, sendOrder } from "@/features/orders/server/orders"
import { getPublicQuote } from "@/features/orders/server/public"
import { workModels } from "@/features/works/server/models"
import { createWorkColumn, deleteWorkColumn, getWorkBoard, reorderWorkColumns, updateWorkColumn } from "@/features/works/server/columns"
import { archiveWork, deleteWork, getWork, listBusinessWorks, listWorks, markWorkPaid, moveWork, purgeArchivedWorks, restoreWork, unmarkWorkPaid, updateWork } from "@/features/works/server/works"
import { createTimeEntry, deleteTimeEntry, updateTimeEntry } from "@/features/works/server/time"
import { addWorkNote, deleteWorkNote, updateWorkNote } from "@/features/works/server/notes"
import { findOpexTool } from "@/features/opex-agent/server/tools/registry"
import { scopeOfAccess } from "@/features/opex-agent/server/scope"

let replica: MongoMemoryReplSet
let admin: AccessContext
let ana: AccessContext
let bia: AccessContext
let businessId: string
let clientId: string
let activityId: string
const access = accessModels()
const businesses = businessModels()
const orders = orderModels()
const works = workModels()
const platform = platformModels()
const all = () => [...Object.values(access), ...Object.values(businesses), ...Object.values(orders), ...Object.values(works), ...Object.values(platform)]
const MARCH = { key: "m", label: "", from: "2026-03-01", to: "2026-03-31" }

beforeAll(async () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "works-tests-only-key"
    replica = await MongoMemoryReplSet.create({ binary: { version: "8.0.18" }, replSet: { count: 1 }, instanceOpts: [{ ip: "127.0.0.1" }] })
    await mongoose.connect(replica.getUri("ciliar_works_test"))
    await Promise.all(all().map((model) => model.init()))
}, 120_000)
beforeEach(async () => {
    await Promise.all(all().map((model) => model.deleteMany({})))
    const role = await access.roles.create({ slug: "admin", nome: "Administrador", permissoes: ["*"], ativo: true })
    const actor = await access.users.create({ name: "Admin", email: "admin@example.test", active: true, roles: [role.id] })
    admin = await resolveAccess(actor.id as string)
    const provider = await createRole(admin, { nome: "Prestador", descricao: "", cor: "azul", ativo: true, permissoes: [...BUSINESS_FULL_PERMISSIONS], limiteNegocios: null })
    const a = await access.users.create({ name: "Ana", email: "ana@example.test", active: true, roles: [provider.id] })
    const b = await access.users.create({ name: "Bia", email: "bia@example.test", active: true, roles: [provider.id] })
    ana = { ...(await resolveAccess(a.id as string)), timeZone: "America/Sao_Paulo" }
    bia = await resolveAccess(b.id as string)
    const business = await businesses.businesses.create({ ownerId: ana.userId, number: 1, name: "Studio", createdBy: ana.userId, updatedBy: ana.userId })
    businessId = business._id.toString()
    clientId = (await createClient(ana, { name: "Cliente", email: "cliente@example.test" })).id
    activityId = (await createActivity(ana, businessId, { name: "Design", hourlyRateCents: 10000 })).id
})
afterAll(async () => {
    await mongoose.disconnect()
    await replica?.stop()
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY
})

/** Pedido aceito pelo prestador → trabalho em Abertura. Devolve o trabalho e a URL do link. */
async function acceptedWork() {
    const order = await createOrder(ana, businessId, { clientId, description: "Site institucional", items: [{ activityId, minutes: 90 }] })
    const sent = await sendOrder(ana, businessId, order.id, { version: order.version, email: false })
    const accepted = await acceptOrder(ana, businessId, order.id, { version: sent.order.version })
    return { work: await getWork(ana, businessId, accepted.workId!), url: sent.url, orderId: order.id }
}
const versionOf = async (workId: string) => (await getWork(ana, businessId, workId)).version
const userSimulation = async (target: AccessContext) => resolveAccess(admin.userId, Buffer.from(JSON.stringify({ tipo: "usuario", userId: target.userId })).toString("base64url"))

describe("trabalho criado pelo aceite", () => {
    it("nasce em Abertura com valor, horas, movimentação inicial e aparece no negócio e na visão geral", async () => {
        const { work } = await acceptedWork()
        expect(work).toMatchObject({ column: "opening", columnName: "Abertura", code: "PED-0001", title: "Site institucional", totalCents: 15000, estimatedMinutes: 90, loggedMinutes: 0, clientName: "Cliente", editable: true })
        expect(work.moves).toEqual([expect.objectContaining({ from: null, to: "opening", toName: "Abertura" })])
        expect((await listBusinessWorks(ana, businessId)).items).toHaveLength(1)
        expect((await listWorks(ana)).items[0]!.businessName).toBe("Studio")
        expect((await listWorks(bia)).items).toHaveLength(0)
        await expect(getWork(bia, businessId, work.id)).rejects.toMatchObject({ code: "BUSINESS_NOT_FOUND" })
    })
    it("suporte (view_all) só lê; simulação de usuário age como o alvo e audita o ator real", async () => {
        const { work } = await acceptedWork()
        expect((await getWork(admin, businessId, work.id)).editable).toBe(false)
        await expect(moveWork(admin, businessId, work.id, { column: "execution", version: work.version })).rejects.toMatchObject({ code: "BUSINESS_NOT_FOUND" })
        const simulated = await userSimulation(ana)
        await moveWork(simulated, businessId, work.id, { column: "execution", version: work.version })
        const audit = await access.audits.findOne({ action: "business.work.move", targetId: work.id }).lean()
        expect(audit?.actorId).toBe(admin.userId)
        expect(audit?.simulation).toBeTruthy()
    })
})

describe("colunas", () => {
    it("customizadas entre Abertura e Pago; fixas imutáveis; excluir só vazia (arquivados contam)", async () => {
        let board = await createWorkColumn(ana, businessId, { name: "Aguardando cliente", color: "rose", icon: "pause", afterKey: "validation" })
        const key = board.columns.find((column) => !column.fixed)!.key
        expect(board.layout).toEqual(["opening", "execution", "validation", key, "paid"])
        board = await createWorkColumn(ana, businessId, { name: "Depois de Pago?", color: "sky", icon: "star", afterKey: "paid" })
        expect(board.layout.at(-1)).toBe("paid")
        await expect(updateWorkColumn(ana, businessId, "paid", { name: "Recebido", color: "sky", icon: "star" })).rejects.toMatchObject({ code: "WORK_COLUMN_FIXED" })
        await expect(deleteWorkColumn(ana, businessId, "opening")).rejects.toMatchObject({ code: "WORK_COLUMN_FIXED" })
        await expect(reorderWorkColumns(ana, businessId, { order: [key, ...board.layout.filter((item) => item !== key)] })).rejects.toMatchObject({ code: "WORK_COLUMN_FIXED" })
        const other = board.layout.find((item) => item.startsWith("col-") && item !== key)!
        board = await reorderWorkColumns(ana, businessId, { order: ["opening", key, "execution", "validation", other, "paid"] })
        expect(board.columns.map((column) => column.name)).toEqual(["Abertura", "Aguardando cliente", "Execução", "Validação", "Depois de Pago?", "Pago"])
        expect((await updateWorkColumn(ana, businessId, key, { name: "Aguardando", color: "amber", icon: "hourglass" })).columns[1]).toMatchObject({ name: "Aguardando", color: "amber" })

        const { work } = await acceptedWork()
        await moveWork(ana, businessId, work.id, { column: key, version: work.version })
        expect((await getWork(ana, businessId, work.id)).columnName).toBe("Aguardando")
        expect((await listWorks(ana)).items[0]!.column).toBe(key)
        await archiveWork(ana, businessId, work.id)
        await expect(deleteWorkColumn(ana, businessId, key)).rejects.toMatchObject({ code: "WORK_COLUMN_NOT_EMPTY" })
        expect((await getWorkBoard(ana, businessId)).counts[key]).toBe(1)
        await deleteWorkColumn(ana, businessId, other)
        expect((await getWorkBoard(ana, businessId)).layout).not.toContain(other)
        await expect(createWorkColumn(bia, businessId, { name: "X", color: "rose", icon: "pause" })).rejects.toMatchObject({ code: "BUSINESS_NOT_FOUND" })
    })
})

describe("movimentação e Pago", () => {
    it("move livre; Pago só pelo pagamento; corrigir pagamento; sair de Pago com confirmação e histórico", async () => {
        const { work } = await acceptedWork()
        const moved = await moveWork(ana, businessId, work.id, { column: "validation", version: work.version })
        await expect(moveWork(ana, businessId, work.id, { column: "paid", version: moved.version })).rejects.toMatchObject({ code: "WORK_PAYMENT_REQUIRED" })
        await expect(moveWork(ana, businessId, work.id, { column: "col-inexistente", version: moved.version })).rejects.toMatchObject({ code: "WORK_COLUMN_NOT_FOUND" })
        await expect(moveWork(ana, businessId, work.id, { column: "execution", version: work.version })).rejects.toMatchObject({ code: "VERSION_CONFLICT" })
        const paid = await markWorkPaid(ana, businessId, work.id, { paidOn: "2026-03-10", receivedCents: 14000, method: "PIX", version: moved.version })
        expect(paid).toMatchObject({ column: "paid", payment: { paidOn: "2026-03-10", receivedCents: 14000, method: "PIX" } })
        expect((await measureGoalWindows(businessId, [MARCH])).get("m")).toEqual({ revenueCents: 14000, minutes: 0 })
        await expect(moveWork(ana, businessId, work.id, { column: "execution", version: paid.version })).rejects.toMatchObject({ code: "WORK_UNPAY_REQUIRED" })
        const edited = await markWorkPaid(ana, businessId, work.id, { paidOn: "2026-03-12", receivedCents: 15000, method: "Transferência", version: paid.version })
        expect(edited.payments.map((event) => event.kind)).toEqual(["edited", "marked"])
        expect(edited.moves.filter((move) => move.to === "paid")).toHaveLength(1)
        await expect(unmarkWorkPaid(ana, businessId, work.id, { column: "validation", version: edited.version })).rejects.toBeTruthy()
        const back = await unmarkWorkPaid(ana, businessId, work.id, { column: "validation", confirm: true, version: edited.version })
        expect(back).toMatchObject({ column: "validation", payment: null })
        expect(back.payments[0]).toMatchObject({ kind: "unmarked", paidOn: "2026-03-12", receivedCents: 15000 })
        expect((await measureGoalWindows(businessId, [MARCH])).get("m")).toEqual({ revenueCents: 0, minutes: 0 })
        expect(await access.audits.countDocuments({ action: { $in: ["business.work.pay", "business.work.payment_edit", "business.work.unpay"] }, targetId: work.id })).toBe(3)
    })
    it("arquivado em Pago sai do faturamento; restaurar volta a contar; arquivado não aceita alterações", async () => {
        const { work } = await acceptedWork()
        await createTimeEntry(ana, businessId, work.id, { source: "orderItem", refId: work.items[0]!.id, date: "2026-03-01", minutes: 120 })
        await markWorkPaid(ana, businessId, work.id, { paidOn: "2026-03-20", receivedCents: 15000, version: await versionOf(work.id) })
        expect((await measureGoalWindows(businessId, [MARCH])).get("m")).toEqual({ revenueCents: 15000, minutes: 120 })
        await archiveWork(ana, businessId, work.id)
        expect((await measureGoalWindows(businessId, [MARCH])).get("m")).toEqual({ revenueCents: 0, minutes: 0 })
        await expect(moveWork(ana, businessId, work.id, { column: "execution", version: await versionOf(work.id) })).rejects.toMatchObject({ code: "WORK_ARCHIVED" })
        expect((await listBusinessWorks(ana, businessId)).items).toHaveLength(0)
        expect((await listBusinessWorks(ana, businessId, { status: "all" })).items[0]!.purgeAt).toBeTruthy()
        await restoreWork(ana, businessId, work.id)
        expect((await measureGoalWindows(businessId, [MARCH])).get("m")).toEqual({ revenueCents: 15000, minutes: 120 })
    })
})

describe("dados do pedido pelo trabalho (W1)", () => {
    it("edita itens/valor/prazo no pedido aceito com versão `work` não publicada; o link mostra a versão aceita", async () => {
        const { work, url } = await acceptedWork()
        const updated = await updateWork(ana, businessId, work.id, { items: [{ id: work.items[0]!.id, minutes: 180 }, { activityId, minutes: 30 }], dueDate: "2026-12-01", version: work.version })
        expect(updated).toMatchObject({ estimatedMinutes: 210, totalCents: 35000, dueDate: "2026-12-01" })
        expect(updated.versions[0]).toMatchObject({ reason: "work", published: false })
        expect(updated.versions[0]!.changes).toEqual(expect.arrayContaining([expect.objectContaining({ field: "totalCents", before: 15000, after: 35000 })]))
        const order = await getOrder(ana, businessId, work.orderId)
        expect(order).toMatchObject({ status: "accepted", totalCents: 35000, dueDate: "2026-12-01" })
        const quote = await getPublicQuote(url.split("/").at(-1)!)
        expect(quote).toMatchObject({ state: "accepted", totalCents: 15000 })
        expect(quote.history.every((entry) => entry.reason !== "work")).toBe(true)
        const manual = await updateWork(ana, businessId, work.id, { totalOverrideCents: 30000, version: updated.version })
        expect(manual).toMatchObject({ totalCents: 30000, totalManual: true })
        await expect(updateWork(ana, businessId, work.id, { dueDate: null, version: work.version })).rejects.toMatchObject({ code: "VERSION_CONFLICT" })
    })
})

describe("horas", () => {
    it("item do pedido ou atividade fora do pedido com valor/hora congelado; soma no trabalho; sem data futura", async () => {
        const { work } = await acceptedWork()
        const extra = await createActivity(ana, businessId, { name: "Revisão", hourlyRateCents: 5000 })
        const first = await createTimeEntry(ana, businessId, work.id, { source: "orderItem", refId: work.items[0]!.id, date: "2026-03-02", minutes: 90, description: "Layout" })
        expect(first).toMatchObject({ name: "Design", hourlyRateCents: 10000, valueCents: 15000 })
        const second = await createTimeEntry(ana, businessId, work.id, { source: "activity", refId: extra.id, date: "2026-03-03", minutes: 60 })
        expect(second).toMatchObject({ name: "Revisão", hourlyRateCents: 5000 })
        await businesses.activities.updateOne({ _id: extra.id }, { $set: { hourlyRateCents: 9999 } })
        expect((await getWork(ana, businessId, work.id)).timeEntries.find((entry) => entry.id === second.id)!.hourlyRateCents).toBe(5000)
        expect((await getWork(ana, businessId, work.id)).loggedMinutes).toBe(150)
        await expect(createTimeEntry(ana, businessId, work.id, { source: "orderItem", refId: work.items[0]!.id, date: "2999-01-01", minutes: 30 })).rejects.toMatchObject({ code: "TIME_ENTRY_FUTURE" })
        await businesses.activities.updateOne({ _id: extra.id }, { $set: { active: false } })
        await expect(createTimeEntry(ana, businessId, work.id, { source: "activity", refId: extra.id, date: "2026-03-03", minutes: 30 })).rejects.toMatchObject({ code: "ACTIVITY_INACTIVE" })
        const edited = await updateTimeEntry(ana, businessId, work.id, first.id, { minutes: 30, version: first.version })
        expect(edited.minutes).toBe(30)
        expect((await getWork(ana, businessId, work.id)).loggedMinutes).toBe(90)
        await deleteTimeEntry(ana, businessId, work.id, second.id)
        expect((await getWork(ana, businessId, work.id)).loggedMinutes).toBe(30)
        expect(await access.audits.countDocuments({ action: /^business\.work_time\./ })).toBe(4)
    })
})

describe("notas", () => {
    it("só o autor (usuário real) edita ou exclui a própria nota", async () => {
        const { work } = await acceptedWork()
        const noted = await addWorkNote(ana, businessId, work.id, { content: "Cliente pediu ajustes" })
        const note = noted.notes[0]!
        expect(note).toMatchObject({ authorName: "Ana", mine: true })
        const simulated = await userSimulation(ana)
        await expect(updateWorkNote(simulated, businessId, work.id, note.id, { content: "Outro" })).rejects.toMatchObject({ code: "WORK_NOTE_NOT_AUTHOR" })
        await expect(deleteWorkNote(simulated, businessId, work.id, note.id)).rejects.toMatchObject({ code: "WORK_NOTE_NOT_AUTHOR" })
        expect((await getWork(simulated, businessId, work.id)).notes[0]!.mine).toBe(false)
        const edited = await updateWorkNote(ana, businessId, work.id, note.id, { content: "Ajustes aprovados" })
        expect(edited.notes[0]).toMatchObject({ content: "Ajustes aprovados" })
        expect(edited.notes[0]!.editedAt).toBeTruthy()
        expect((await deleteWorkNote(ana, businessId, work.id, note.id)).notes).toHaveLength(0)
        expect(await access.audits.countDocuments({ action: /^business\.work_note\./ })).toBe(3)
    })
})

describe("sucesso, exclusão e purge", () => {
    it("um sucesso por trabalho; excluir o sucesso libera a conversão", async () => {
        const { work } = await acceptedWork()
        const success = await createSuccess(ana, businessId, { title: work.title, clientId, workId: work.id, date: "2026-03-20" })
        expect(success).toMatchObject({ workId: work.id, clientId })
        expect((await getWork(ana, businessId, work.id)).success).toMatchObject({ id: success.id })
        await expect(createSuccess(ana, businessId, { title: "De novo", workId: work.id })).rejects.toMatchObject({ code: "WORK_ALREADY_CONVERTED" })
        await archiveSuccess(ana, businessId, success.id)
        await deleteSuccess(ana, businessId, success.id)
        expect((await getWork(ana, businessId, work.id)).successId).toBeNull()
    })
    it("excluir (só arquivado) apaga horas/notas/movimentações; o pedido fica Aceito como registro (W5)", async () => {
        const { work } = await acceptedWork()
        await createTimeEntry(ana, businessId, work.id, { source: "orderItem", refId: work.items[0]!.id, date: "2026-03-02", minutes: 60 })
        await addWorkNote(ana, businessId, work.id, { content: "Nota" })
        const success = await createSuccess(ana, businessId, { title: "Case", workId: work.id })
        await expect(deleteWork(ana, businessId, work.id)).rejects.toMatchObject({ code: "WORK_NOT_ARCHIVED" })
        await archiveWork(ana, businessId, work.id)
        await deleteWork(ana, businessId, work.id)
        expect(await works.works.exists({ _id: work.id })).toBeNull()
        expect(await works.timeEntries.countDocuments({ workId: work.id })).toBe(0)
        expect(await works.notes.countDocuments({ workId: work.id })).toBe(0)
        expect(await works.moves.countDocuments({ workId: work.id })).toBe(0)
        const order = await getOrder(ana, businessId, work.orderId)
        expect(order).toMatchObject({ status: "accepted", workId: null })
        expect(order.workDeletedAt).toBeTruthy()
        expect((await businesses.successes.findById(success.id).lean())!.workId).toBeNull()
    })
    it("purge exclui arquivados vencidos pelo prazo de Trabalhos; excluir o negócio leva tudo", async () => {
        const { work } = await acceptedWork()
        await archiveWork(ana, businessId, work.id)
        await works.works.updateOne({ _id: work.id }, { $set: { archivedAt: new Date("2000-01-01") } })
        expect(await purgeArchivedWorks()).toContain("1 trabalho")
        expect(await works.works.exists({ _id: work.id })).toBeNull()
        expect(await access.audits.exists({ action: "business.work.purge", targetId: work.id })).toBeTruthy()

        const second = await acceptedWork()
        await createWorkColumn(ana, businessId, { name: "Extra", color: "rose", icon: "pause" })
        await addWorkNote(ana, businessId, second.work.id, { content: "Nota" })
        await archiveBusiness(ana, businessId)
        await deleteBusiness(ana, businessId)
        expect(await works.works.countDocuments({ businessId })).toBe(0)
        expect(await works.columns.countDocuments({ businessId })).toBe(0)
        expect(await works.notes.countDocuments({ businessId })).toBe(0)
    })
})

describe("ferramentas do Agente Opex", () => {
    const context = (who: AccessContext) => ({ sessionId: "s", actorId: who.userId, scope: scopeOfAccess(who), access: who })
    it("lista, move, marca/corrige o pagamento e lança horas pelos serviços reais", async () => {
        const { work } = await acceptedWork()
        const tool = (name: string) => findOpexTool(name)!
        const run = (name: string, input: unknown) => tool(name).execute(tool(name).input.parse(input), context(ana))
        expect(((await run("list_works", { businessId })) as { items: unknown[] }).items).toHaveLength(1)
        expect(await run("move_work", { businessId, workId: work.id, column: "execution" })).toMatchObject({ column: "execution" })
        expect(await run("mark_work_paid", { businessId, workId: work.id, paidOn: "2026-03-05", method: "PIX" })).toMatchObject({ column: "paid", payment: { receivedCents: 15000, method: "PIX" } })
        await expect(run("move_work", { businessId, workId: work.id, column: "validation" })).rejects.toThrow(/unmark_work_paid/)
        expect(await run("mark_work_paid", { businessId, workId: work.id, receivedCents: 12000 })).toMatchObject({ payment: { paidOn: "2026-03-05", receivedCents: 12000, method: "PIX" } })
        expect(await run("create_time_entry", { businessId, workId: work.id, source: "orderItem", refId: work.items[0]!.id, date: "2026-03-04", minutes: 45 })).toMatchObject({ minutes: 45 })
        expect(await run("unmark_work_paid", { businessId, workId: work.id, column: "validation" })).toMatchObject({ column: "validation", payment: null })
        const converted = (await run("convert_work_to_success", { businessId, workId: work.id })) as { workId: string; clientId: string }
        expect(converted).toMatchObject({ workId: work.id, clientId })
    })
})
