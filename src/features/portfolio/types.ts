import type { BusinessStatus, BusinessThemeMode } from "@/features/businesses/constants"
import type { BusinessFileDto } from "@/features/businesses/types"
import type { BlockProblem, PortfolioBlock } from "./blocks"
import type { ContentPool, PoolFile, ResolvedBlock, ResolvedFile } from "./resolve"

/** DTOs do portfólio (M5). */

export interface PortfolioThemeDto {
    primaryColor: string
    mode: BusinessThemeMode
}

/** Dados fixos do cabeçalho e do contato (vêm da Ficha do negócio). */
export interface PortfolioBusinessDto {
    name: string
    description: string | null
    segment: string | null
    logoUrl: string | null
    links: string[]
    contactEmail: string | null
    contactPhone: string | null
    whatsappUrl: string | null
    theme: PortfolioThemeDto
}

export interface PortfolioMediaDto extends PoolFile {
    /** Rota autenticada do conteúdo (sem `basePath`). */
    url: string
    createdAt: string
}

/** Editor do portfólio (dono ou suporte). */
export interface PortfolioDto {
    businessId: string
    /** `null` enquanto o portfólio não foi criado (suporte ou negócio arquivado). */
    slug: string | null
    url: string | null
    published: boolean
    publishedAt: string | null
    indexable: boolean
    version: number
    draft: { blocks: PortfolioBlock[]; version: number; updatedAt: string | null }
    live: { blocks: PortfolioBlock[]; number: number; publishedAt: string | null }
    /** O rascunho é diferente do publicado. */
    hasChanges: boolean
    /** Ainda não escolheu o modelo inicial. */
    needsTemplate: boolean
    problems: BlockProblem[]
    /** Conteúdo disponível do negócio (com as rotas autenticadas dos arquivos). */
    pool: ContentPool
    /** Quantos de cada fonte existem mas não estão disponíveis (arquivados, desmarcados, inativos). */
    unavailable: Record<keyof ContentPool, number>
    media: PortfolioMediaDto[]
    business: PortfolioBusinessDto
    /** E-mail do contato é o da conta (sem e-mail comercial na Ficha, P51). */
    contactEmailIsAccount: boolean
    businessStatus: BusinessStatus
    editable: boolean
    canPublish: boolean
}

export interface PortfolioDraftSavedDto {
    draftVersion: number
    updatedAt: string
    hasChanges: boolean
    problems: BlockProblem[]
}

export interface PortfolioPublicationDto {
    number: number
    publishedAt: string
    publishedBy: string
    publishedByName: string | null
    blocks: number
    current: boolean
}

export interface PortfolioSlugCheckDto {
    slug: string
    valid: boolean
    available: boolean
    message: string | null
}

export interface PortfolioItemDto {
    id: string
    businessId: string
    status: BusinessStatus
    archivedAt: string | null
    purgeAt: string | null
    version: number
    createdAt: string
    updatedAt: string
    title: string
    description: string | null
    url: string | null
    date: string | null
    tags: string[]
    images: BusinessFileDto[]
}

// ── Página pública ─────────────────────────────────────────────────────────

export type PublicPortfolioFileDto = ResolvedFile

export interface PublicPortfolioDto {
    slug: string
    indexable: boolean
    business: PortfolioBusinessDto
    blocks: ResolvedBlock[]
    /** Até quando as URLs dos arquivos valem (ISO); depois a página relê. */
    urlsExpireAt: string
}
