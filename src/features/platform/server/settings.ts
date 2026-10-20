import type { ClientSession } from "mongoose"
import { getUnassignableRoles } from "@nandobfer/perfix"
import { DomainError } from "@/lib/api/route"
import { catalog } from "@/features/access/catalog"
import { auditAccess, authorityTransaction, conflict, denied, roleRows } from "@/features/access/server/access"
import { parseInput } from "@/features/access/server/commands"
import type { AccessContext } from "@/features/access/server/context"
import type { RoleDto } from "@/features/access/types"
import { PLATFORM_SETTINGS_ID, SIGNUP_UNAVAILABLE_MESSAGES, type SignupUnavailableReason } from "../constants"
import { platformSettingsUpdateSchema } from "../schemas"
import type { DefaultRoleOption, PlatformSettingsDto, SignupAvailability } from "../types"
import { platformModels } from "./models"
import { ensurePlatformRecord, loadPlatformState, type PlatformState } from "./state"

/** Motivo pelo qual o perfil não pode ser o padrão do cadastro público (Administrador e wildcard nunca). */
export function defaultRoleProblem(role: Pick<RoleDto, "slug" | "ativo" | "permissoes"> | undefined): string | null {
    if (!role) return "Perfil não encontrado"
    if (role.slug === "admin" || role.permissoes.includes("*")) return "O Administrador não pode ser o perfil padrão do cadastro público"
    if (!role.ativo) return "Perfil inativo"
    return null
}

function availabilityOf(state: PlatformState, rows: RoleDto[]): SignupAvailability {
    let reason: SignupUnavailableReason | null = null
    if (!state.settings.defaultRoleId) reason = "no-default-role"
    else if (defaultRoleProblem(rows.find((row) => row.id === state.settings.defaultRoleId))) reason = "default-role-invalid"
    else if (state.legalVersion < 1) reason = "no-legal-version"
    return { available: reason === null, reason, message: reason ? SIGNUP_UNAVAILABLE_MESSAGES[reason] : null }
}

/** Cadastro público disponível? Falha fechado: sem perfil padrão válido ou sem termos publicados, não. */
export async function signupAvailability(session: ClientSession | null = null): Promise<SignupAvailability & { defaultRoleId: string | null; legalVersion: number }> {
    const [state, rows] = await Promise.all([loadPlatformState(session), roleRows(session)])
    return { ...availabilityOf(state, rows), defaultRoleId: state.settings.defaultRoleId, legalVersion: state.legalVersion }
}

function roleOptions(context: AccessContext, rows: RoleDto[]): DefaultRoleOption[] {
    const candidates = rows.filter((row) => row.slug !== "admin")
    const blocked = new Map(getUnassignableRoles(catalog, context.roles, candidates.filter((row) => row.ativo)).map((role) => [role.id, role.motivo]))
    return candidates.map((row) => {
        const problem = defaultRoleProblem(row)
        const motivo = problem ?? blocked.get(row.id)
        return { id: row.id, nome: row.nome, cor: row.cor, ativo: row.ativo, bloqueado: !!motivo, ...(motivo ? { motivo } : {}) }
    })
}

export async function getPlatformSettings(context: AccessContext): Promise<PlatformSettingsDto> {
    const [state, rows] = await Promise.all([loadPlatformState(), roleRows()])
    return {
        settings: state.settings,
        version: state.version,
        legalVersion: state.legalVersion,
        updatedAt: state.updatedAt ? state.updatedAt.toISOString() : null,
        signup: availabilityOf(state, rows),
        roleOptions: roleOptions(context, rows),
    }
}

/**
 * Salva a configuração. O perfil padrão é autoridade (concede acesso a qualquer conta Google):
 * transação com fence, versão otimista, perfil ativo, nunca o Administrador e somente perfis que o
 * ator real/simulado pode atribuir pela hierarquia do Perfix.
 */
export async function updatePlatformSettings(context: AccessContext, raw: unknown): Promise<PlatformSettingsDto> {
    const { version, ...next } = parseInput(platformSettingsUpdateSchema, raw)
    await ensurePlatformRecord()
    await authorityTransaction(context, ["integrations.platform.edit"], async (current, session) => {
        const before = await loadPlatformState(session)
        if (before.version !== version) throw conflict()
        if (next.defaultRoleId && next.defaultRoleId !== before.settings.defaultRoleId) {
            const rows = await roleRows(session)
            const role = rows.find((row) => row.id === next.defaultRoleId)
            const problem = defaultRoleProblem(role)
            if (problem) throw new DomainError(400, problem, "DEFAULT_ROLE_INVALID")
            if (getUnassignableRoles(catalog, current.roles, [role!]).length) throw denied("Você não pode atribuir esse perfil pela sua hierarquia")
        }
        await platformModels().settings.updateOne(
            { _id: PLATFORM_SETTINGS_ID, version },
            { $set: { ...next, updatedBy: current.userId }, $inc: { version: 1 } },
            { session },
        )
        await auditAccess(current, "platform.update", "platform", before.settings, next, session)
    })
    return getPlatformSettings(context)
}

