import type { RoleLike } from "@nandobfer/perfix"

export interface RoleDto extends RoleLike {
    id: string; slug: string; nome: string; descricao: string; cor: string; permissoes: string[];
    ativo: boolean; posicao: number; version: number; escopos: never[];
    createdAt: string; updatedAt: string; createdBy?: string; updatedBy?: string;
}
export interface Simulation { tipo: "cargo" | "usuario"; alvoId: string; alvoNome: string }
export interface AccessDto { permissions: string[]; roles: RoleDto[]; realIsAdministrator: boolean; simulation: Simulation | null }
export interface SessionDto { user: { id: string; name: string; email: string; mustChangePassword: boolean }; access: AccessDto }
export interface UserDto { id: string; nome: string; email: string; ativo: boolean; version: number; cargos: RoleDto[]; roleIds: string[]; gerenciavel: boolean }
