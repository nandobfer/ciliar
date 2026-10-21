import { Types, type ClientSession } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { parseInput } from "@/features/access/server/commands"
import type { AccessContext } from "@/features/access/server/context"
import { auditBusiness } from "@/features/businesses/server/access"
import { writeItem } from "@/features/businesses/server/items"
import { WORK_NOTE_AUDIT } from "../constants"
import { workNoteSchema } from "../schemas"
import type { WorkDetailDto } from "../types"
import { loadWork, workArchived, type WorkDoc } from "./core"
import { workModels } from "./models"
import { getWork } from "./works"

/**
 * Notas/comentários internos do trabalho (M4 §4) — SOMENTE servidor. O autor é o usuário REAL (na
 * simulação, quem simula); só o autor edita ou exclui a própria nota, com auditoria.
 */

const noteNotFound = () => new DomainError(404, "Nota não encontrada", "WORK_NOTE_NOT_FOUND")
const notAuthor = () => new DomainError(403, "Só o autor edita ou exclui a própria nota.", "WORK_NOTE_NOT_AUTHOR")

async function loadNote(work: WorkDoc, noteId: string, session: ClientSession) {
    if (!Types.ObjectId.isValid(noteId)) throw noteNotFound()
    const note = await workModels().notes.findOne({ _id: noteId, workId: work._id.toString() }).session(session).lean()
    if (!note) throw noteNotFound()
    return note
}

const preview = (text: string) => (text.length > 300 ? `${text.slice(0, 300)}…` : text)

export async function addWorkNote(access: AccessContext, businessId: string, workId: string, raw: unknown): Promise<WorkDetailDto> {
    const { content } = parseInput(workNoteSchema, raw)
    await writeItem(access, businessId, "works", async ({ current, session }) => {
        const work = await loadWork(businessId, workId, session)
        if (work.status !== "active") throw workArchived()
        const [note] = await workModels().notes.create([{ workId, businessId, authorId: current.userId, content, editedAt: null }], { session })
        await auditBusiness(current, `${WORK_NOTE_AUDIT}.create`, note!._id.toString(), null, { businessId, workId, code: work.code, content: preview(content) }, session)
        return { result: undefined }
    })
    return getWork(access, businessId, workId)
}

export async function updateWorkNote(access: AccessContext, businessId: string, workId: string, noteId: string, raw: unknown): Promise<WorkDetailDto> {
    const { content } = parseInput(workNoteSchema, raw)
    await writeItem(access, businessId, "works", async ({ current, session }) => {
        const work = await loadWork(businessId, workId, session)
        if (work.status !== "active") throw workArchived()
        const note = await loadNote(work, noteId, session)
        if (note.authorId !== current.userId) throw notAuthor()
        if (note.content === content) return { result: undefined }
        await workModels().notes.updateOne({ _id: note._id }, { $set: { content, editedAt: new Date() } }, { session })
        await auditBusiness(current, `${WORK_NOTE_AUDIT}.update`, noteId, { businessId, workId, code: work.code, content: preview(note.content) }, { businessId, workId, code: work.code, content: preview(content) }, session)
        return { result: undefined }
    })
    return getWork(access, businessId, workId)
}

export async function deleteWorkNote(access: AccessContext, businessId: string, workId: string, noteId: string): Promise<WorkDetailDto> {
    await writeItem(access, businessId, "works", async ({ current, session }) => {
        const work = await loadWork(businessId, workId, session)
        if (work.status !== "active") throw workArchived()
        const note = await loadNote(work, noteId, session)
        if (note.authorId !== current.userId) throw notAuthor()
        await workModels().notes.deleteOne({ _id: note._id }, { session })
        await auditBusiness(current, `${WORK_NOTE_AUDIT}.delete`, noteId, { businessId, workId, code: work.code, content: preview(note.content) }, null, session)
        return { result: undefined }
    })
    return getWork(access, businessId, workId)
}
