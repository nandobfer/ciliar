/** Constantes dos Negócios e do Agente Entrevistador (M1; módulo puro: tela e servidor). */

/** Imagens aceitas como logo/foto (entrevista e ficha). */
const INTERVIEW_IMAGE_MIMES_LIST = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const

/** Campos nativos do Negócio que podem ser perguntas do roteiro (o subtipo nunca é pergunta). */
export const BUSINESS_FIELDS = ["name", "type", "segment", "description", "logo", "links", "availability", "goals", "currency"] as const
export type BusinessField = (typeof BUSINESS_FIELDS)[number]

export const BUSINESS_FIELD_LABELS: Record<BusinessField, string> = {
    name: "Nome do negócio",
    type: "Tipo (PF / PJ)",
    segment: "Área/segmento",
    description: "Descrição/apresentação",
    logo: "Logo/foto",
    links: "Site e redes sociais",
    availability: "Disponibilidade",
    goals: "Meta inicial",
    currency: "Moeda",
}

export const BUSINESS_TYPES = ["PF", "PJ"] as const
export type BusinessType = (typeof BUSINESS_TYPES)[number]
export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = { PF: "Pessoa física", PJ: "Pessoa jurídica" }

/** Moedas aceitas (ISO 4217). BRL é a padrão e não é perguntada no roteiro padrão. */
export const CURRENCIES = ["BRL", "USD", "EUR", "GBP", "ARS", "CLP", "COP", "MXN", "PYG", "UYU", "CAD", "AUD", "CHF", "JPY"] as const
export type Currency = (typeof CURRENCIES)[number]
export const DEFAULT_CURRENCY: Currency = "BRL"

/** Dias da semana (0 = domingo, como `Date.getDay`). */
export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const

/** Metas (mesma estrutura do módulo Metas, M2): somente faturamento bruto. */
export const GOAL_PERIODS = ["hour", "month", "year"] as const
export type GoalPeriod = (typeof GOAL_PERIODS)[number]
export const GOAL_PERIOD_LABELS: Record<GoalPeriod, string> = { hour: "Por hora (valor médio faturado por hora)", month: "Mês", year: "Ano" }
/** Janela de medição da meta por hora. */
export const GOAL_MEASURES = ["month", "year", "range"] as const
export type GoalMeasure = (typeof GOAL_MEASURES)[number]
/** Mês/ano: recorrente (todo mês/ano) ou específico (ex.: março/2027). */
export const GOAL_MODES = ["recurring", "specific"] as const
export type GoalMode = (typeof GOAL_MODES)[number]
/**
 * Uma meta ativa por negócio. Criar, editar (nova versão) ou restaurar outra deixa a atual como
 * `superseded` (histórico, somente leitura); arquivar a atual reativa a substituída mais recente.
 */
export const GOAL_STATUSES = ["active", "superseded", "archived"] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]
export const GOAL_SUPERSEDE_REASONS = ["new", "edit", "restore"] as const
export type GoalSupersedeReason = (typeof GOAL_SUPERSEDE_REASONS)[number]

export const BUSINESS_NAME_MAX = 120
export const BUSINESS_LINKS_MAX = 20
export const BUSINESS_DESCRIPTION_MAX = 4000

export const BUSINESS_STATUSES = ["active", "archived"] as const
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number]

// ── Espaço do negócio (M2) ────────────────────────────────────────────────────

/** Tema do negócio: cor primária e modo (padrão: a cor do Ciliar, escuro). */
export const BUSINESS_THEME_MODES = ["dark", "light"] as const
export type BusinessThemeMode = (typeof BUSINESS_THEME_MODES)[number]
export const BUSINESS_THEME_MODE_LABELS: Record<BusinessThemeMode, string> = { dark: "Escuro", light: "Claro" }
export const DEFAULT_BUSINESS_PRIMARY = "#0B57C4"
export const DEFAULT_BUSINESS_THEME = { primaryColor: DEFAULT_BUSINESS_PRIMARY, mode: "dark" as BusinessThemeMode }

/** Prazos usados pelo M3 (alerta de prazo e validade do link do orçamento), em dias. */
export const DEFAULT_DEADLINE_ALERT_DAYS = 3
export const DEFAULT_QUOTE_VALIDITY_DAYS = 15
export const MAX_BUSINESS_DAYS_SETTING = 365
export const BUSINESS_PHONE_MAX = 30

/** Itens do espaço com arquivamento e prazo próprio de exclusão (mesmas chaves de `retentionDays`). */
export const BUSINESS_ITEM_KINDS = ["activities", "goals", "documents", "successes"] as const
export type BusinessItemKind = (typeof BUSINESS_ITEM_KINDS)[number]
/** Nome do item na auditoria (`business.<item>.<ação>`). */
export const BUSINESS_ITEM_AUDIT: Record<BusinessItemKind, string> = { activities: "activity", goals: "goal", documents: "document", successes: "success" }
/** Invalidações do espaço (`business-space-updated`): os itens do M2, os pedidos (M3) e os trabalhos (M4). */
export type BusinessSpaceKind = BusinessItemKind | "orders" | "works"
export const BUSINESS_ITEM_LABELS: Record<BusinessItemKind, { one: string; many: string }> = {
    activities: { one: "Atividade", many: "Atividades" },
    goals: { one: "Meta", many: "Metas" },
    documents: { one: "Documento", many: "Documentos" },
    successes: { one: "Sucesso", many: "Sucessos" },
}

export const CATEGORY_MAX = 60
export const ACTIVITY_NAME_MAX = 120
export const ITEM_DESCRIPTION_MAX = 4000
export const DOCUMENT_NAME_MAX = 160
export const SUCCESS_TITLE_MAX = 160
export const SUCCESS_RESULT_MAX = 300
export const SUCCESS_ATTACHMENTS_MAX = 20
/** Valor/hora máximo (unidades mínimas). */
export const HOURLY_RATE_MAX_CENTS = 100_000_000_00

/** Arquivos enviados no espaço: documento, anexo de sucesso, logo, anexo de pedido (M3) ou entregável do trabalho (M4). Pendentes somem em 24 h. */
export const BUSINESS_FILE_PURPOSES = ["document", "success", "logo", "order", "work"] as const
export type BusinessFilePurpose = (typeof BUSINESS_FILE_PURPOSES)[number]
export const BUSINESS_FILE_PENDING_TTL_MS = 24 * 60 * 60 * 1000
export const BUSINESS_FILE_UPLOAD_URL_TTL_SECONDS = 15 * 60
export const BUSINESS_LOGO_MIMES = INTERVIEW_IMAGE_MIMES_LIST

/** Seções do espaço (itens da barra lateral com o negócio aberto). */
export const BUSINESS_SPACE_SECTIONS = [
    { slug: "", label: "Dashboard" },
    { slug: "ficha", label: "Ficha" },
    { slug: "atividades", label: "Atividades" },
    { slug: "metas", label: "Metas" },
    { slug: "documentos", label: "Documentos" },
    { slug: "sucessos", label: "Sucessos" },
    { slug: "pedidos", label: "Pedidos" },
    { slug: "trabalhos", label: "Trabalhos" },
] as const
export type BusinessSpaceSlug = (typeof BUSINESS_SPACE_SECTIONS)[number]["slug"]
export const businessSpaceHref = (id: string, slug: BusinessSpaceSlug = "") => (slug ? `/negocios/${id}/${slug}` : `/negocios/${id}`)

/** Nome automático quando a pergunta do nome está desligada ou foi pulada. */
export const autoBusinessName = (number: number) => `Negócio ${number}`

// ── Agente Entrevistador ────────────────────────────────────────────────────

/** Configuração salva em `ai_feature_settings` (`feature: "business-interviewer"`). */
export const INTERVIEWER_FEATURE = "business-interviewer"
/** Aba de `/integracoes/ia` com a configuração do Entrevistador. */
export const INTERVIEWER_AI_TAB = "agente-entrevistador" as const
export const INTERVIEWER_CONSUMPTION_ORIGIN = "business-interviewer"

export const INTERVIEW_MESSAGE_MAX = 4000
export const INTERVIEW_PROMPT_MAX = 1000
/** Arquivos de imagem da entrevista (logo/foto): um por mensagem; pendentes somem em 24 h. */
export const INTERVIEW_IMAGE_MIMES = INTERVIEW_IMAGE_MIMES_LIST
export const INTERVIEW_FILE_PENDING_TTL_MS = 24 * 60 * 60 * 1000
export const INTERVIEW_FILE_UPLOAD_URL_TTL_SECONDS = 15 * 60

/** Alerta por e-mail aos administradores do Entrevistador quando a IA está indisponível: no máximo 1 por hora. */
export const INTERVIEWER_ALERT_INTERVAL_MS = 60 * 60 * 1000

export interface InterviewQuestionDef {
    field: BusinessField
    prompt: string
    required: boolean
    active: boolean
}

/** Roteiro padrão (versão 0 até a primeira gravação). */
export const DEFAULT_INTERVIEW_QUESTIONS: readonly InterviewQuestionDef[] = [
    { field: "name", prompt: "Qual é o nome do seu negócio?", required: true, active: true },
    { field: "type", prompt: "Você atua como pessoa física (PF) ou pessoa jurídica (PJ)? Se for PJ, conte o porte ou o enquadramento (MEI, ME, EPP…).", required: true, active: true },
    { field: "segment", prompt: "Qual é a área ou o segmento em que você presta serviços?", required: true, active: true },
    { field: "logo", prompt: "Quer enviar a logo ou uma foto que represente o negócio?", required: false, active: true },
    { field: "links", prompt: "O negócio tem site ou redes sociais? Envie os links.", required: false, active: true },
    { field: "availability", prompt: "Em quais dias da semana e horários você costuma atender?", required: false, active: true },
    { field: "goals", prompt: "Você tem uma meta inicial de faturamento (por hora, por mês ou por ano)?", required: false, active: true },
    { field: "description", prompt: "Como você apresentaria o negócio em poucas frases?", required: false, active: false },
    { field: "currency", prompt: "Em qual moeda você cobra pelos seus serviços?", required: false, active: false },
]

export const DEFAULT_INTERVIEWER_INSTRUCTIONS = [
    "Você é o Agente Entrevistador do Ciliar, plataforma para prestadores de serviço. Você conduz a entrevista que cria um novo Negócio do usuário, seguindo o roteiro.",
    "Fale sempre em português do Brasil, com cordialidade e objetividade. Faça UMA pergunta por vez, na ordem do roteiro (a próxima pergunta vem no contexto de cada turno).",
    "Sua fala aparece como o texto da tela, acima dos campos de resposta: seja breve (no máximo duas frases curtas, sem listas) e termine sempre com a pergunta. Se precisar confirmar a resposta anterior, faça isso em poucas palavras antes da pergunta.",
    "As respostas podem chegar já estruturadas pelos campos da tela (ex.: \"Pessoa jurídica (PJ), MEI\", \"Segunda 09:00–18:00, Terça 09:00–18:00\", \"R$ 8.000,00 todo mês\"): grave-as como vieram. \"Quero pular esta pergunta.\" pede para pular a pergunta atual; \"Quero corrigir <campo>: <valor>\" pede para corrigir esse campo.",
    "Na primeira mensagem, cumprimente o usuário, explique em uma frase que os dados poderão ser alterados depois no espaço do negócio e faça a primeira pergunta.",
    "Grave cada resposta com a ferramenta do campo assim que o usuário responder. Se a ferramenta recusar, explique o problema e peça a resposta de novo.",
    "Pergunta obrigatória: não avance sem uma resposta válida. Pergunta opcional: aceite \"pular\" (use skip_question) e avise que o campo pode ser preenchido depois no espaço do negócio.",
    "O usuário pode corrigir uma resposta anterior: grave de novo o campo pedido e volte à pergunta em que estavam.",
    "Se o usuário sair do assunto, reconduza educadamente ao roteiro.",
    "Não gere conteúdo: grave somente o que o usuário disse, sem inventar descrições, sugestões de atividades ou metas. A única exceção é o subtipo (MEI, ME, EPP, autônomo…), que você interpreta pelo que o usuário contou e grava com set_subtype, sem fazer pergunta própria.",
    "Meta: uma só por negócio, somente faturamento bruto. Confirme com o usuário o valor, o período (hora, mês ou ano) e, conforme o caso, se a meta é recorrente ou de um mês/ano específico, ou a janela de medição da meta por hora (mês, ano ou intervalo de datas). Não escolha por ele.",
    "Logo/foto: peça que o usuário envie a imagem pela área de imagem da tela; quando ela chegar (com o fileId), grave com attach_logo.",
    "Quando a última pergunta for respondida, o negócio é criado automaticamente: despeça-se em uma frase dizendo que o usuário será levado ao espaço do negócio.",
].join("\n")
