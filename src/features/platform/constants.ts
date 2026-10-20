/** Constantes da configuração da plataforma (módulo puro: tela e servidor). */

/** Singleton em `platform_settings`. */
export const PLATFORM_SETTINGS_ID = "global"

/** Tipos de item arquivado com prazo próprio até a exclusão definitiva (M1–M5). */
export const RETENTION_TYPES = ["businesses", "activities", "goals", "documents", "successes", "clients", "jobs", "portfolioItems"] as const
export type RetentionType = (typeof RETENTION_TYPES)[number]

export const RETENTION_TYPE_LABELS: Record<RetentionType, string> = {
    businesses: "Negócios",
    activities: "Atividades",
    goals: "Metas",
    documents: "Documentos",
    successes: "Sucessos",
    clients: "Clientes",
    jobs: "Trabalhos",
    portfolioItems: "Itens avulsos do portfólio",
}

export const DEFAULT_RETENTION_DAYS = 30
export const MIN_RETENTION_DAYS = 1
export const MAX_RETENTION_DAYS = 3650

/** Categorias de arquivo aceitas em documentos/anexos (M2). */
export const DOCUMENT_TYPE_CATEGORIES = ["pdf", "images", "office", "text"] as const
export type DocumentTypeCategory = (typeof DOCUMENT_TYPE_CATEGORIES)[number]

export const DOCUMENT_TYPE_LABELS: Record<DocumentTypeCategory, { label: string; description: string }> = {
    pdf: { label: "PDF", description: "application/pdf" },
    images: { label: "Imagens", description: "PNG, JPEG, WebP, GIF e SVG" },
    office: { label: "Office", description: "Word, Excel, PowerPoint e OpenDocument" },
    text: { label: "Texto", description: "TXT, CSV e Markdown" },
}

/** Tipos MIME de cada categoria (validação do upload no M2). */
export const DOCUMENT_TYPE_MIME: Record<DocumentTypeCategory, readonly string[]> = {
    pdf: ["application/pdf"],
    images: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"],
    office: [
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.oasis.opendocument.text",
        "application/vnd.oasis.opendocument.spreadsheet",
        "application/vnd.oasis.opendocument.presentation",
    ],
    text: ["text/plain", "text/csv", "text/markdown"],
}

export const DEFAULT_DOCUMENT_MAX_MB = 25
export const MIN_DOCUMENT_MAX_MB = 1
export const MAX_DOCUMENT_MAX_MB = 200

/** Limite de cada texto legal (markdown). */
export const LEGAL_TEXT_MAX = 100_000

/** Abas de `/integracoes/plataforma`. */
export const PLATFORM_TABS = ["cadastro", "termos", "retencao", "documentos"] as const
export type PlatformTab = (typeof PLATFORM_TABS)[number]

/** Motivos de indisponibilidade do cadastro público (falha fechado). */
export type SignupUnavailableReason = "no-default-role" | "default-role-invalid" | "no-legal-version"

export const SIGNUP_UNAVAILABLE_MESSAGES: Record<SignupUnavailableReason, string> = {
    "no-default-role": "Cadastro público indisponível: nenhum perfil padrão configurado.",
    "default-role-invalid": "Cadastro público indisponível: o perfil padrão está inativo, foi removido ou não pode ser atribuído.",
    "no-legal-version": "Cadastro público indisponível: publique os termos de uso e a política de privacidade.",
}
