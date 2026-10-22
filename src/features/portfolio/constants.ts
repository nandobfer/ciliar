import { BUSINESS_LOGO_MIMES } from "@/features/businesses/constants"

/** Portfólio público do negócio (M5). Regras em `docs/modulos/m5-portfolio.md`. */

export const PORTFOLIO_PAGE_PATH = "/p"
export const portfolioPagePath = (slug: string) => `${PORTFOLIO_PAGE_PATH}/${slug}`
export const portfolioPublicApiPath = (slug: string) => `/api/public/portfolio/${slug}`
/** Pré-visualização (com sessão, fora da casca do app). */
export const portfolioPreviewPath = (businessId: string) => `/previa-portfolio/${businessId}`

/** Fontes de conteúdo dos blocos Seção e Item em destaque (cabeçalho e contato são fixos). */
export const PORTFOLIO_SECTION_KEYS = ["services", "successes", "items", "documents"] as const
export type PortfolioSectionKey = (typeof PORTFOLIO_SECTION_KEYS)[number]
export const PORTFOLIO_SECTION_LABELS: Record<PortfolioSectionKey, string> = {
    services: "Serviços",
    successes: "Sucessos",
    items: "Projetos",
    documents: "Documentos",
}

export const PORTFOLIO_SLUG_MIN = 3
export const PORTFOLIO_SLUG_MAX = 60
export const PORTFOLIO_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** Recusados como slug (rotas e nomes do app). */
export const PORTFOLIO_RESERVED_SLUGS: ReadonlySet<string> = new Set([
    "admin",
    "api",
    "login",
    "logout",
    "p",
    "orcamento",
    "negocios",
    "clientes",
    "pedidos",
    "trabalhos",
    "usuarios",
    "perfis",
    "integracoes",
    "termos",
    "privacidade",
    "ciliar",
    "www",
    "app",
    "_next",
    "static",
    "previa",
    "previa-portfolio",
    "portfolio",
])

/** Biblioteca de mídia do portfólio: arquivos `purpose: media` vinculados a este marcador. */
export const PORTFOLIO_MEDIA_OWNER = "portfolio-media"
/** URLs assinadas dos arquivos públicos (S3) valem 10 minutos. */
export const PORTFOLIO_FILE_URL_TTL_SECONDS = 600
/** Leituras públicas por IP a cada 15 minutos. */
export const PORTFOLIO_READ_LIMIT = 240

export const CONFIDENTIAL_CLIENT_LABEL = "Cliente confidencial"

// ── Itens avulsos ──────────────────────────────────────────────────────────

export const PORTFOLIO_ITEM_TITLE_MAX = 160
export const PORTFOLIO_ITEM_URL_MAX = 500
export const PORTFOLIO_ITEM_IMAGES_MAX = 20
export const PORTFOLIO_ITEM_TAGS_MAX = 10
export const PORTFOLIO_ITEM_TAG_MAX = 40
export const PORTFOLIO_IMAGE_MIMES = BUSINESS_LOGO_MIMES
