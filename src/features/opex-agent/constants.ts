/** Constantes do "Agente Opex" (módulo puro: tela e servidor). */

/** Configuração salva em `ai_feature_settings` (`feature: "opex-agent"`). */
export const OPEX_FEATURE = "opex-agent"

/** Aba de `/integracoes/ia` com a configuração do agente. */
export const OPEX_AI_TAB = "agente-opex" as const

/** Provedores do agente: só os que aceitam ferramentas definidas pelo app (o OpenCode não aceita). */
export const OPEX_PROVIDER_IDS = ["gemini", "anthropic", "openai", "deepseek"] as const
export type OpexProviderId = (typeof OPEX_PROVIDER_IDS)[number]

export function isOpexProviderId(value: string): value is OpexProviderId {
    return (OPEX_PROVIDER_IDS as readonly string[]).includes(value)
}

/**
 * Grupos de ferramentas. As ferramentas em si (nome, risco e permissões exigidas) ficam no catálogo
 * puro `tool-catalog.ts`; a configuração guarda só as **desligadas** (ferramenta nova nasce ligada).
 */
export const OPEX_TOOL_GROUPS = ["context", "files", "businesses", "users", "roles", "integrations", "api-tokens", "routines", "platform"] as const
export type OpexToolGroup = (typeof OPEX_TOOL_GROUPS)[number]

export const OPEX_TOOL_GROUP_LABELS: Record<OpexToolGroup, { label: string; description: string }> = {
    context: { label: "Contexto", description: "Usuário, permissões efetivas, simulação e data/hora atual" },
    files: { label: "Arquivos do chat", description: "Listar e ler os arquivos enviados no chat" },
    businesses: { label: "Negócios", description: "Listar, ler (com a transcrição da entrevista), editar, arquivar, restaurar e excluir definitivamente os negócios" },
    users: { label: "Usuários", description: "Listar, ler, convidar (pré-cadastro), reenviar convite, editar, ativar/desativar, atribuir perfis e excluir usuários" },
    roles: { label: "Perfis", description: "Listar, ler, criar, editar permissões, reordenar e excluir perfis" },
    integrations: { label: "Integrações", description: "Ler (sem segredos), configurar, testar e consultar logs das integrações" },
    "api-tokens": { label: "Tokens da API interna", description: "Listar, gerar e revogar tokens de sistema da API interna" },
    routines: { label: "Rotinas", description: "Crons do agendador interno" },
    platform: { label: "Plataforma", description: "Cadastro público (perfil padrão), termos e privacidade versionados, prazos de exclusão e limites de documentos" },
}

/** Quando o agente pede confirmação antes de executar: só ações destrutivas ou toda escrita. */
export const OPEX_CONFIRMATION_POLICIES = ["destructive", "writes"] as const
export type OpexConfirmationPolicy = (typeof OPEX_CONFIRMATION_POLICIES)[number]

export const OPEX_CONFIRMATION_POLICY_LABELS: Record<OpexConfirmationPolicy, string> = {
    destructive: "Só ações destrutivas",
    writes: "Toda alteração",
}

/** Eventos no canal privado do usuário (`private-opex-{userId}`). Payload: `{ id }` (sessão). */
export const OPEX_SESSION_UPDATED_EVENT = "opex-session-updated"
export const OPEX_SESSION_DELETED_EVENT = "opex-session-deleted"

export const OPEX_AUDIT_ENTITY = "AgenteOpex"
/** Origens do painel de consumo de IA. */
export const OPEX_CONSUMPTION_ORIGIN = "opex-agent"
export const OPEX_TITLE_CONSUMPTION_ORIGIN = "opex-title"

export const OPEX_TITLE_MAX = 60
export const OPEX_SUMMARY_MAX = 280
export const OPEX_MESSAGE_MAX = 20_000
export const OPEX_DEFAULT_TITLE = "Nova sessão"

export const DEFAULT_OPEX_INSTRUCTIONS = [
    "Você é o Agente Opex, o assistente do Ciliar: a plataforma em que prestadores de serviço gerenciam os seus Negócios e em que a administração gerencia usuários, perfis de acesso (permissões Perfix), as integrações do app (Pusher, API interna, crons, provedores de IA, SMTP e Storage S3) e a configuração da plataforma (cadastro público, termos e privacidade, prazos de exclusão e limites de documentos).",
    "Um Negócio só nasce pela entrevista do Agente Entrevistador: você não cria negócios. Para criar, oriente o usuário a abrir /negocios/novo. Você pode listar, ler, editar, arquivar, restaurar e excluir definitivamente (só arquivados) os negócios do usuário.",
    "O login é somente pelo Google: não existem senhas. Cadastrar usuário é um convite (pré-cadastro do e-mail Google com os perfis); a pessoa entra com o Google usando esse e-mail.",
    "Você executa o que o usuário pede usando as ferramentas do app. Use quantas ferramentas forem necessárias: consulte antes de perguntar, encadeie chamadas e confira o resultado.",
    "Você age sempre como o usuário autenticado: cada ferramenta revalida a sessão e as permissões dele (inclusive durante uma simulação de \"Visualizar como\"). Se uma ferramenta negar acesso, explique que o perfil do usuário não permite a ação; nunca tente contornar.",
    "Nunca invente ids, e-mails, perfis, permissões ou valores: descubra-os pelas ferramentas (ex.: list_users, list_roles, list_permission_catalog, list_integrations).",
    "Quando uma ferramenta responder `confirmation_required`, a ação aguarda o usuário clicar em Confirmar ou Cancelar no chat: diga em uma frase o que será feito e encerre a resposta. Você receberá a decisão e o resultado na próxima mensagem.",
    "O usuário pode enviar arquivos no chat (cada um aparece com o id `fileId`). Imagens, PDFs e textos chegam a você quando o modelo lê o tipo; os demais vêm só como referência.",
    "Credenciais de integrações podem ser gravadas, mas nunca são lidas: as ferramentas só informam se um segredo está definido. O valor de um token da API interna aparece uma única vez, no card de criação, onde o usuário pode copiá-lo: não o repita no texto.",
    "Responda em português do Brasil, em Markdown, de forma objetiva. Use listas e tabelas curtas quando ajudarem.",
].join("\n")

export const DEFAULT_OPEX_TITLE_INSTRUCTIONS = [
    "Você mantém o título e o resumo de uma sessão de chat entre um usuário e um assistente.",
    `Título: até ${OPEX_TITLE_MAX} caracteres, sem aspas nem ponto final, que identifique o assunto principal da sessão.`,
    `Resumo: até ${OPEX_SUMMARY_MAX} caracteres, em uma ou duas frases, com o que foi pedido, o que foi feito e o que está pendente.`,
    "Atualize os dois com base no título e resumo atuais e no último turno: mantenha o que continua válido e incorpore o que mudou.",
    "Escreva em português do Brasil.",
    'Responda APENAS com JSON: {"title": "...", "summary": "..."}',
].join("\n")

/** Sugestões do estado vazio do chat. */
export const OPEX_SUGGESTIONS = [
    "Quais usuários estão ativos?",
    "Quais permissões tem o perfil Administrador?",
    "Como estão as integrações?",
    "Gere um token para a API interna",
] as const

/** Arquivos do chat: limites padrão (configuráveis) e tetos. */
export const OPEX_FILES_PER_MESSAGE_DEFAULT = 10
export const OPEX_FILES_PER_MESSAGE_MAX = 50
export const OPEX_FILE_SIZE_MB_DEFAULT = 100
export const OPEX_FILE_SIZE_MB_MAX = 100
/** Arquivo enviado e não usado numa mensagem é removido (S3 + metadado) pela rotina depois disso. */
export const OPEX_FILE_PENDING_TTL_MS = 24 * 60 * 60 * 1000
/** Validade da URL assinada do PUT direto no storage. */
export const OPEX_FILE_UPLOAD_URL_TTL_SECONDS = 15 * 60
/** Texto de arquivo enviado ao modelo por turno (o resto fica para read_chat_file). */
export const OPEX_FILE_TEXT_INLINE_MAX = 100_000
/** Maior arquivo baixado do storage para ir como conteúdo ao modelo; acima disso vira só referência. */
export const OPEX_FILE_CONTENT_MAX_BYTES = 20 * 1024 * 1024
/** Maior arquivo de texto lido do storage para `read_chat_file` e para o texto inline. */
export const OPEX_FILE_TEXT_MAX_BYTES = 5 * 1024 * 1024

/** Chave das abas abertas no navegador (o id do usuário real é acrescentado em `scope.ts`). */
export const OPEX_TABS_STORAGE_KEY = "ciliar:opex-agent:tabs:v1"

/** Atalho global: Ctrl+Shift+O (⌘+Shift+O no Mac). */
export function isOpexShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">): boolean {
    return (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "o"
}
