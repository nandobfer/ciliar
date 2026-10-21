import { randomBytes } from "node:crypto"
import { DomainError } from "@/lib/api/route"
import { parseInput } from "@/features/access/server/commands"
import type { AccessContext } from "@/features/access/server/context"
import { auditBusiness } from "@/features/businesses/server/access"
import { readBusiness, writeItem } from "@/features/businesses/server/items"
import { isValidWorkLayout, normalizeWorkLayout, placeColumnAfter, type WorkBoardDto } from "../board"
import { isFixedWorkColumn, WORK_COLUMN_AUDIT, WORK_CUSTOM_COLUMNS_MAX } from "../constants"
import { workColumnCreateSchema, workColumnInputSchema, workColumnsReorderSchema } from "../schemas"
import { boardOf } from "./core"
import { workModels } from "./models"

/**
 * Colunas do quadro do negócio (M4) — SOMENTE servidor. As 4 fixas nunca mudam; as customizadas são
 * criadas, renomeadas e reordenadas livremente entre Abertura e Pago, e só são excluídas vazias
 * (inclusive sem trabalhos arquivados nelas).
 */

const columnNotFound = () => new DomainError(404, "Coluna não encontrada", "WORK_COLUMN_NOT_FOUND")
const fixedColumn = () => new DomainError(409, "As colunas fixas (Abertura, Execução, Validação e Pago) não podem ser alteradas.", "WORK_COLUMN_FIXED")

export async function getWorkBoard(access: AccessContext, businessId: string): Promise<WorkBoardDto> {
    const { editable } = await readBusiness(access, businessId, "works.columns")
    const [{ columns, layout }, counts] = await Promise.all([
        boardOf(businessId),
        workModels().works.aggregate<{ _id: string; count: number }>([{ $match: { businessId } }, { $group: { _id: "$column", count: { $sum: 1 } } }]),
    ])
    return { businessId, columns, layout, counts: Object.fromEntries(counts.map((row) => [row._id, row.count])), editable }
}

async function saveLayout(businessId: string, order: string[], session: import("mongoose").ClientSession): Promise<void> {
    await workModels().layouts.updateOne({ businessId }, { $set: { order } }, { upsert: true, session })
}

export async function createWorkColumn(access: AccessContext, businessId: string, raw: unknown): Promise<WorkBoardDto> {
    const input = parseInput(workColumnCreateSchema, raw)
    await writeItem(access, businessId, "works", async ({ current, session, ownerId }) => {
        const board = await boardOf(businessId, session)
        if (board.customs.length >= WORK_CUSTOM_COLUMNS_MAX) throw new DomainError(409, `Limite de ${WORK_CUSTOM_COLUMNS_MAX} colunas customizadas por negócio.`, "WORK_COLUMN_LIMIT")
        const key = `col-${randomBytes(6).toString("hex")}`
        const fields = { name: input.name, color: input.color, icon: input.icon, description: input.description.trim() || null }
        await workModels().columns.create([{ businessId, ownerId, key, ...fields, createdBy: current.userId }], { session })
        const layout = normalizeWorkLayout(placeColumnAfter(board.layout, key, input.afterKey ?? null), [...board.customs.map((column) => column.key), key])
        await saveLayout(businessId, layout, session)
        await auditBusiness(current, `${WORK_COLUMN_AUDIT}.create`, key, null, { businessId, ...fields, position: layout.indexOf(key) }, session)
        return { result: undefined }
    })
    return getWorkBoard(access, businessId)
}

export async function updateWorkColumn(access: AccessContext, businessId: string, key: string, raw: unknown): Promise<WorkBoardDto> {
    if (isFixedWorkColumn(key)) throw fixedColumn()
    const input = parseInput(workColumnInputSchema, raw)
    await writeItem(access, businessId, "works", async ({ current, session }) => {
        const before = await workModels().columns.findOne({ businessId, key }).session(session).lean()
        if (!before) throw columnNotFound()
        const fields = { name: input.name, color: input.color, icon: input.icon, description: input.description.trim() || null }
        await workModels().columns.updateOne({ _id: before._id }, { $set: fields }, { session })
        await auditBusiness(current, `${WORK_COLUMN_AUDIT}.update`, key, { businessId, name: before.name, color: before.color, icon: before.icon, description: before.description ?? null }, { businessId, ...fields }, session)
        return { result: undefined }
    })
    return getWorkBoard(access, businessId)
}

/** Só exclui coluna customizada sem trabalhos (ativos ou arquivados). */
export async function deleteWorkColumn(access: AccessContext, businessId: string, key: string): Promise<WorkBoardDto> {
    if (isFixedWorkColumn(key)) throw fixedColumn()
    await writeItem(access, businessId, "works", async ({ current, session }) => {
        const column = await workModels().columns.findOne({ businessId, key }).session(session).lean()
        if (!column) throw columnNotFound()
        const inside = await workModels().works.find({ businessId, column: key }).select({ code: 1 }).limit(5).session(session).lean()
        const count = await workModels().works.countDocuments({ businessId, column: key }).session(session)
        if (count > 0) {
            const codes = inside.map((work) => work.code).filter(Boolean)
            throw new DomainError(
                409,
                `Mova ${count === 1 ? "o trabalho" : `os ${count} trabalhos`} desta coluna antes de excluí-la${codes.length ? ` (${codes.join(", ")}${count > codes.length ? "…" : ""})` : ""}. Arquivados também contam.`,
                "WORK_COLUMN_NOT_EMPTY",
            )
        }
        await workModels().columns.deleteOne({ _id: column._id }, { session })
        const board = await boardOf(businessId, session)
        await saveLayout(businessId, board.layout, session)
        await auditBusiness(current, `${WORK_COLUMN_AUDIT}.delete`, key, { businessId, name: column.name, color: column.color, icon: column.icon }, null, session)
        return { result: undefined }
    })
    return getWorkBoard(access, businessId)
}

/** Nova ordem do quadro: exatamente as colunas atuais, Abertura primeiro, Pago por último e as fixas na ordem. */
export async function reorderWorkColumns(access: AccessContext, businessId: string, raw: unknown): Promise<WorkBoardDto> {
    const { order } = parseInput(workColumnsReorderSchema, raw)
    await writeItem(access, businessId, "works", async ({ current, session }) => {
        const board = await boardOf(businessId, session)
        const same = order.length === board.layout.length && [...order].sort().join("|") === [...board.layout].sort().join("|")
        if (!same) throw new DomainError(409, "As colunas mudaram enquanto você reorganizava. Recarregue e tente de novo.", "COLUMNS_CHANGED")
        const customs = board.customs.map((column) => column.key)
        if (!isValidWorkLayout(order, customs)) throw new DomainError(409, "As colunas customizadas ficam entre Abertura e Pago, e as fixas não mudam de ordem.", "WORK_COLUMN_FIXED")
        await saveLayout(businessId, order, session)
        await auditBusiness(current, `${WORK_COLUMN_AUDIT}.reorder`, businessId, { businessId, order: board.layout }, { businessId, order }, session)
        return { result: undefined }
    })
    return getWorkBoard(access, businessId)
}
