import type { SignupUnavailableReason } from "./constants"
import type { PlatformSettings } from "./schemas"

export interface SignupAvailability {
    available: boolean
    reason: SignupUnavailableReason | null
    message: string | null
}

/** Perfil que pode (ou não) ser o padrão do cadastro público. */
export interface DefaultRoleOption {
    id: string
    nome: string
    cor: string
    ativo: boolean
    bloqueado: boolean
    motivo?: string
}

export interface PlatformSettingsDto {
    settings: PlatformSettings
    version: number
    legalVersion: number
    updatedAt: string | null
    signup: SignupAvailability
    roleOptions: DefaultRoleOption[]
}

export interface LegalVersionSummary {
    version: number
    publishedAt: string
    publishedBy: string
    publishedByName: string | null
    notes: string
}

export interface LegalVersionDto extends LegalVersionSummary {
    termsOfUse: string
    privacyPolicy: string
}

export interface LegalOverviewDto {
    current: LegalVersionDto | null
    history: LegalVersionSummary[]
}

/** O que o usuário autenticado precisa para aceitar a versão vigente. */
export interface MyLegalDto {
    current: LegalVersionDto | null
    acceptedVersion: number | null
    acceptedAt: string | null
    acceptanceRequired: boolean
}
