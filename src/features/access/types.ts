import type { RoleLike } from "@nandobfer/perfix"

export interface RoleDto extends RoleLike {
    id: string; slug: string; nome: string; descricao: string; cor: string; permissoes: string[];
    ativo: boolean; posicao: number; version: number; escopos: never[];
    /** Limite de negócios ativos (`null` = ilimitado). */
    limiteNegocios: number | null;
    createdAt: string; updatedAt: string; createdBy?: string; updatedBy?: string;
}
export interface Simulation { tipo: "cargo" | "usuario"; alvoId: string; alvoNome: string }
export interface AccessDto { permissions: string[]; roles: RoleDto[]; realIsAdministrator: boolean; simulation: Simulation | null }
export interface SessionDto {
    user: { id: string; name: string; email: string; legalAcceptanceRequired: boolean; legalVersion: number;
        /** A conta tem senha (login por e-mail e senha); nunca o hash. */
        hasPassword?: boolean }; access: AccessDto;
    /** Onboarding obrigatório (M1): sem negócio ativo, só a entrevista até concluir. */
    onboarding?: { required: boolean; interviewId: string | null; archived: number };
}
export interface UserDto {
    id: string; nome: string; email: string; ativo: boolean; version: number; cargos: RoleDto[]; roleIds: string[]; gerenciavel: boolean;
    /** Ainda não tem como entrar: sem Google vinculado e sem senha (conta pré-cadastrada). */
    convitePendente: boolean;
    /** Métodos de login da conta (nunca o vínculo nem o hash). */
    metodos: { google: boolean; senha: boolean }; ultimoAcesso: string | null; termosAceitos: number | null;
}
/** Resultado do envio do convite por e-mail. */
export type InviteResult = "enviado" | "falhou" | "nao-solicitado" | "smtp-indisponivel"
