import { z } from "zod"
import { expandPermissions } from "@nandobfer/perfix"
import { dbConnect } from "@/lib/db"
import { objectId, passwordSchema } from "@/features/access/schemas"
import { userRows } from "@/features/access/server/access"
import { createUser, deleteUser, updateUser } from "@/features/access/server/commands"
import { accessModels } from "@/features/access/server/models"
import type { AccessContext } from "@/features/access/server/context"
import { defineTool, OpexToolError } from "./define"

const PASSWORD_REDACTED = "[senha omitida]"

const userRef = z.string().trim().min(1).max(200).describe("Id do usuário ou e-mail")
const roleIds = z.array(objectId).max(50).describe("Ids dos perfis (de list_roles)")

type UserRow = Awaited<ReturnType<typeof userRows>>[number]

/** Usuário em formato enxuto para o modelo (nunca hash nem versão de sessão). */
function slimUser(user: UserRow) {
    return {
        id: user.id,
        name: user.nome,
        email: user.email,
        active: user.ativo,
        roles: user.cargos.map((role) => ({ id: role.id, name: role.nome })),
        manageable: user.gerenciavel,
    }
}

async function findUser(access: AccessContext, ref: string): Promise<UserRow> {
    await dbConnect()
    const value = ref.trim().toLowerCase()
    const rows = await userRows(access)
    const found = rows.find((user) => user.id === ref.trim() || user.email.toLowerCase() === value)
    if (!found) throw new OpexToolError(`Usuário "${ref}" não encontrado. Use list_users para achar o id ou o e-mail.`)
    return found
}

export const userTools = [
    defineTool("list_users", {
        input: z.object({
            search: z.string().trim().max(100).optional().describe("Trecho do nome ou e-mail"),
            status: z.enum(["all", "active", "inactive"]).optional().describe("Situação (padrão: all)"),
        }),
        execute: async ({ search, status }, { access }) => {
            await dbConnect()
            const term = search?.toLowerCase()
            const rows = (await userRows(access)).filter(
                (user) =>
                    (!term || user.nome.toLowerCase().includes(term) || user.email.toLowerCase().includes(term)) &&
                    (!status || status === "all" || (status === "active" ? user.ativo : !user.ativo)),
            )
            return { total: rows.length, users: rows.slice(0, 200).map(slimUser) }
        },
    }),
    defineTool("get_user", {
        input: z.object({ user: userRef }),
        execute: async ({ user }, { access }) => {
            const found = await findUser(access, user)
            const active = found.cargos.filter((role) => role.ativo)
            const effective = expandPermissions(active)
            return { ...slimUser(found), effectivePermissions: effective.has("*") ? ["*"] : [...effective].sort() }
        },
    }),
    defineTool("create_user", {
        input: z.object({
            name: z.string().trim().min(2).max(100),
            email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido")),
            password: passwordSchema.describe("Senha inicial (12 a 128 caracteres); o usuário troca no primeiro acesso"),
            active: z.boolean().default(true),
            roleIds: roleIds.min(1, "Selecione ao menos um perfil"),
        }),
        summarize: (input) => `Cadastrar o usuário ${input.name} (${input.email})${input.active ? "" : " inativo"} com ${input.roleIds.length} perfil(is)`,
        redact: (input) => ({ ...input, password: PASSWORD_REDACTED }),
        execute: async (input, { access }) => {
            await dbConnect()
            const { id } = await createUser(access, { nome: input.name, email: input.email, password: input.password, ativo: input.active, cargos: input.roleIds })
            return { ok: true, id, name: input.name, email: input.email, mustChangePassword: true }
        },
    }),
    defineTool("update_user", {
        input: z.object({
            user: userRef,
            name: z.string().trim().min(2).max(100).optional(),
            active: z.boolean().optional(),
            roleIds: roleIds.optional().describe("Lista COMPLETA de perfis (substitui a atual)"),
        }),
        summarize: (input) => {
            const parts = [input.name ? `nome para "${input.name}"` : null, input.active === undefined ? null : input.active ? "ativar" : "desativar", input.roleIds ? `perfis (${input.roleIds.length})` : null].filter(Boolean)
            return `Alterar ${parts.join(", ") || "o usuário"} de ${input.user}`
        },
        execute: async (input, { access }) => {
            if (input.name === undefined && input.active === undefined && input.roleIds === undefined) throw new OpexToolError("Nada para alterar: informe name, active ou roleIds.")
            const found = await findUser(access, input.user)
            const { users } = accessModels()
            const current = await users.findById(found.id).select({ name: 1, active: 1, roles: 1, accessVersion: 1 }).lean()
            if (!current) throw new OpexToolError("Usuário não encontrado")
            await updateUser(access, found.id, {
                nome: input.name ?? current.name,
                ativo: input.active ?? current.active,
                cargos: input.roleIds ?? current.roles,
                version: current.accessVersion,
            })
            return slimUser(await findUser(access, found.id))
        },
    }),
    defineTool("delete_user", {
        input: z.object({ user: userRef }),
        summarize: (input) => `Excluir o usuário ${input.user}`,
        execute: async ({ user }, { access }) => {
            const found = await findUser(access, user)
            const current = await accessModels().users.findById(found.id).select({ accessVersion: 1 }).lean()
            if (!current) throw new OpexToolError("Usuário não encontrado")
            await deleteUser(access, found.id, current.accessVersion)
            return { ok: true, id: found.id, name: found.nome, email: found.email }
        },
    }),
]
