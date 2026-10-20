import { z } from "zod"
import { isPermissionLeaf, type PermissionNodeDef } from "@nandobfer/perfix"
import { dbConnect } from "@/lib/db"
import { can, PERMISSION_TREE } from "@/features/access/catalog"
import { COLORS, objectId } from "@/features/access/schemas"
import { roleRows } from "@/features/access/server/access"
import { createRole, deleteRole, reorderRoles, updateRole } from "@/features/access/server/commands"
import { accessModels } from "@/features/access/server/models"
import type { RoleDto } from "@/features/access/types"
import { defineTool, OpexToolError } from "./define"

const roleRef = z.string().trim().min(1).max(100).describe("Id do perfil ou nome")
const permissionKeys = z.array(z.string().trim().min(1).max(120)).max(200).describe("Chaves de permissão (de list_permission_catalog); substitui a lista inteira")
const color = z.enum(COLORS).describe(`Cor da paleta: ${COLORS.join(", ")}`)

function slimRole(role: RoleDto, members?: number) {
    return {
        id: role.id,
        name: role.nome,
        slug: role.slug,
        description: role.descricao,
        color: role.cor,
        active: role.ativo,
        position: role.posicao,
        administrator: role.slug === "admin",
        permissionCount: role.permissoes.includes("*") ? "todas" : role.permissoes.length,
        ...(members === undefined ? {} : { members }),
    }
}

async function findRole(ref: string): Promise<RoleDto> {
    await dbConnect()
    const value = ref.trim().toLowerCase()
    const found = (await roleRows()).find((role) => role.id === ref.trim() || role.nome.toLowerCase() === value || role.slug === value)
    if (!found) throw new OpexToolError(`Perfil "${ref}" não encontrado. Use list_roles para achar o id ou o nome.`)
    return found
}

type CatalogNode = { key: string; label: string; sensitive: boolean } | { group: string; children: CatalogNode[] }

function catalogNodes(nodes: readonly PermissionNodeDef[], sensitive = false): CatalogNode[] {
    return nodes.map((node) =>
        isPermissionLeaf(node)
            ? { key: node.key, label: node.label, sensitive: sensitive || Boolean(node.sensitive) }
            : { group: node.label, children: catalogNodes(node.children, sensitive || Boolean(node.sensitive)) },
    )
}

export const roleTools = [
    defineTool("list_permission_catalog", {
        input: z.object({}),
        execute: async () => ({ tree: catalogNodes(PERMISSION_TREE as unknown as readonly PermissionNodeDef[]) }),
    }),
    defineTool("list_roles", {
        input: z.object({}),
        execute: async () => {
            await dbConnect()
            const [roles, state, counts] = await Promise.all([
                roleRows(),
                accessModels().states.findById("global").lean(),
                accessModels().users.aggregate<{ _id: string; total: number }>([{ $unwind: "$roles" }, { $group: { _id: "$roles", total: { $sum: 1 } } }]),
            ])
            return { hierarchyVersion: state?.version ?? 0, roles: roles.map((role) => slimRole(role, counts.find((row) => row._id === role.id)?.total ?? 0)) }
        },
    }),
    defineTool("get_role", {
        input: z.object({ role: roleRef }),
        execute: async ({ role }, { access }) => {
            const found = await findRole(role)
            const members = can(access.effective, "users.view") ? await accessModels().users.find({ roles: found.id }).select({ name: 1, email: 1 }).lean() : null
            return {
                ...slimRole(found),
                permissions: found.permissoes,
                members: members ? members.map((user) => ({ id: String(user._id), name: user.name, email: user.email })) : "sem permissão users.view",
            }
        },
    }),
    defineTool("create_role", {
        input: z.object({
            name: z.string().trim().min(1).max(60),
            description: z.string().trim().max(500).default(""),
            color: color.default("roxo"),
            active: z.boolean().default(true),
            permissions: permissionKeys.default([]),
        }),
        summarize: (input) => `Criar o perfil ${input.name} com ${input.permissions.length} permissão(ões)`,
        execute: async (input, { access }) => {
            await dbConnect()
            const { id } = await createRole(access, { nome: input.name, descricao: input.description, cor: input.color, ativo: input.active, permissoes: input.permissions })
            return slimRole(await findRole(id))
        },
    }),
    defineTool("update_role", {
        input: z.object({
            role: roleRef,
            name: z.string().trim().min(1).max(60).optional(),
            description: z.string().trim().max(500).optional(),
            color: color.optional(),
            active: z.boolean().optional(),
            permissions: permissionKeys.optional(),
            memberIds: z.array(objectId).max(500).optional().describe("Ids de TODOS os membros (substitui a lista; exige users.edit)"),
        }),
        summarize: (input) => {
            const parts = [
                input.name ? `nome para "${input.name}"` : null,
                input.description !== undefined ? "descrição" : null,
                input.color ? "cor" : null,
                input.active === undefined ? null : input.active ? "ativar" : "desativar",
                input.permissions ? `permissões (${input.permissions.length})` : null,
                input.memberIds ? `membros (${input.memberIds.length})` : null,
            ].filter(Boolean)
            return `Alterar ${parts.join(", ") || "o perfil"} de ${input.role}`
        },
        execute: async (input, { access }) => {
            const found = await findRole(input.role)
            const patch = {
                ...(input.name !== undefined ? { nome: input.name } : {}),
                ...(input.description !== undefined ? { descricao: input.description } : {}),
                ...(input.color !== undefined ? { cor: input.color } : {}),
                ...(input.active !== undefined ? { ativo: input.active } : {}),
                ...(input.permissions !== undefined ? { permissoes: input.permissions } : {}),
                ...(input.memberIds !== undefined ? { membros: input.memberIds } : {}),
            }
            if (!Object.keys(patch).length) throw new OpexToolError("Nada para alterar.")
            await updateRole(access, found.id, { ...patch, version: found.version })
            const updated = await findRole(found.id)
            return { ...slimRole(updated), permissions: updated.permissoes }
        },
    }),
    defineTool("reorder_roles", {
        input: z.object({ roleIds: z.array(objectId).min(1).max(500).describe("Ids de todos os perfis (menos o Administrador), do mais alto ao mais baixo") }),
        summarize: (input) => `Reordenar a hierarquia de ${input.roleIds.length} perfil(is)`,
        execute: async ({ roleIds }, { access }) => {
            await dbConnect()
            const state = await accessModels().states.findById("global").lean()
            const result = await reorderRoles(access, { ordem: roleIds, version: state?.version ?? 0 })
            return { ok: true, ...result }
        },
    }),
    defineTool("delete_role", {
        input: z.object({ role: roleRef }),
        summarize: (input) => `Excluir o perfil ${input.role}`,
        execute: async ({ role }, { access }) => {
            const found = await findRole(role)
            await deleteRole(access, found.id, found.version)
            return { ok: true, id: found.id, name: found.nome }
        },
    }),
]
